const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../database');
const { authenticateApiKey, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  getAllContainers,
  createContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  getContainerStats
} = require('../docker');

function summarizeStats(rawStats) {
  if (!rawStats) return null;

  const cpuDelta = rawStats.cpu_stats.cpu_usage.total_usage - (rawStats.precpu_stats.cpu_usage?.total_usage || 0);
  const systemDelta = rawStats.cpu_stats.system_cpu_usage - (rawStats.precpu_stats.system_cpu_usage || 0);
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * rawStats.cpu_stats.online_cpus * 100 : 0;

  const memoryUsage = rawStats.memory_stats.usage || 0;
  const memoryLimit = rawStats.memory_stats.limit || 0;
  const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

  const gpuStats = Array.isArray(rawStats.gpu_stats)
    ? rawStats.gpu_stats.map((gpu, index) => {
        const total = gpu.memory_total || gpu.memory_stats?.max_gpu_memory || 0;
        const used = gpu.memory_used || gpu.memory_stats?.used_gpu_memory || 0;
        return {
          index: gpu.index ?? gpu.id ?? index,
          name: gpu.name || `GPU ${gpu.index ?? index}`,
          memoryTotal: total,
          memoryUsed: used,
          memoryPercent: total > 0 ? (used / total) * 100 : 0,
          utilization: gpu.utilization_gpu ?? gpu.gpu_utilization ?? gpu.utilization ?? 0
        };
      })
    : [];

  return {
    cpu: parseFloat(cpuPercent.toFixed(2)),
    memory: {
      usage: memoryUsage,
      limit: memoryLimit,
      percent: parseFloat(memoryPercent.toFixed(2))
    },
    gpu: gpuStats
  };
}

/**
 * GET /api/containers - Get all containers
 * Public endpoint - no authentication required for read access
 */
router.get('/', async (req, res) => {
  try {
    const dockerContainers = await getAllContainers();
    const dbContainers = await pool.query('SELECT * FROM containers ORDER BY created_at DESC');

    // Merge Docker and DB info
    const containers = dockerContainers.map(dc => {
      const dbContainer = dbContainers.rows.find(dbc => dbc.container_id === dc.Id);
      const { id: dbId, ...dbFields } = dbContainer || {};

      return {
        id: dc.Id,
        dockerId: dc.Id,
        dbId: dbId ?? null,
        container_id: dbFields.container_id || dc.Id,
        name: (dc.Names && dc.Names[0]) ? dc.Names[0].replace('/', '') : dbFields?.name || 'unknown',
        status: dbFields.status || dc.State,
        ports: dc.Ports,
        created: dc.Created,
        ...dbFields
      };
    });

    res.json({ success: true, containers });
  } catch (error) {
    logger.error('Error getting containers:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve containers' });
  }
});

router.get('/load-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number.isInteger(Number(id)) ? Number(id) : null;
    const result = await pool.query(
      `SELECT * FROM container_load_status
       WHERE ($1::int IS NOT NULL AND id = $1::int)
         OR id = (SELECT id FROM containers WHERE container_id = $2)` ,
      [numericId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error getting container load status:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve load status' });
  }
});

/**
 * POST /api/containers - Create a new container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/', async (req, res) => {
  let containerId = null;

  try {
    const { name, port, workflowId } = req.body;

    // Validate input
    if (!name || !port) {
      return res.status(400).json({ success: false, error: 'Name and port are required' });
    }

    // Validate and sanitize container name
    // Docker container names must match: [a-zA-Z0-9][a-zA-Z0-9_.-]*
    if (typeof name !== 'string' || name.length < 1 || name.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Container name must be a string between 1 and 255 characters'
      });
    }

    const namePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
    if (!namePattern.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Container name must start with alphanumeric character and contain only alphanumeric, underscore, period, or hyphen'
      });
    }

    // Validate port is an integer
    if (typeof port !== 'number' || !Number.isInteger(port)) {
      return res.status(400).json({
        success: false,
        error: 'Port must be a valid integer'
      });
    }

    // Validate port range
    if (port < 1024 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Port must be between 1024-65535'
      });
    }

    // Validate workflowId if provided
    if (workflowId !== undefined && workflowId !== null) {
      if (typeof workflowId !== 'number' || !Number.isInteger(workflowId) || workflowId < 1) {
        return res.status(400).json({
          success: false,
          error: 'Workflow ID must be a positive integer'
        });
      }
    }

    // Acquire database client only after all basic validation passes
    const client = await pool.connect();

    try {
      // Check if port is already in use
      const portCheck = await client.query('SELECT * FROM containers WHERE port = $1', [port]);
      if (portCheck.rows.length > 0) {
        client.release();
        return res.status(400).json({ success: false, error: 'Port already in use' });
      }

      // Get next instance ID
      const result = await client.query('SELECT MAX(id) as max_id FROM containers');
      let instanceId = (result.rows.length > 0 && result.rows[0] ? result.rows[0].max_id || 0 : 0) + 1;

      // Validate instanceId is a safe integer and within reasonable range
      // Must validate BEFORE using it in any path construction
      if (!Number.isSafeInteger(instanceId) || instanceId < 1 || instanceId > 100000) {
        client.release();
        return res.status(500).json({
          success: false,
          error: 'Instance ID out of valid range'
        });
      }

      // Ensure instanceId is an integer (defense in depth)
      instanceId = Math.floor(instanceId);

      // Construct and validate workflow path to prevent path traversal
      const workflowPath = path.resolve('/app/workflows', `instance-${instanceId}`);

      // Verify the resolved path is still within /app/workflows (prevent path traversal)
      if (!workflowPath.startsWith('/app/workflows/')) {
        client.release();
        return res.status(500).json({
          success: false,
          error: 'Invalid workflow path'
        });
      }

      // Create Docker container
      logger.info(`Creating Docker container for instance ${instanceId} on port ${port}`);
      const container = await createContainer({
        name,
        port,
        instanceId,
        workflowPath
      });

      // Verify container was created with valid ID
      if (!container || !container.id) {
        logger.error('Container creation did not return a valid container object');
        throw new Error('Container creation failed: Invalid container object returned');
      }

      containerId = container.id;
      logger.info(`Docker container created with ID: ${containerId}`);

      // Save to database
      await client.query(
        'INSERT INTO containers (container_id, name, port, status, workflow_id) VALUES ($1, $2, $3, $4, $5)',
        [container.id, name, port, 'created', workflowId]
      );
      logger.info(`Container ${containerId} saved to database`);

      // If workflowId is provided, write workflow file to container's directory
      if (workflowId) {
        const workflow = await client.query('SELECT workflow_json FROM workflows WHERE id = $1', [workflowId]);
        if (workflow.rows.length > 0) {
          // Use the already validated workflowPath
          const workflowFile = path.join(workflowPath, 'workflow.json');

          // Additional safety check: ensure workflowFile is within workflowPath
          const resolvedWorkflowFile = path.resolve(workflowFile);
          if (!resolvedWorkflowFile.startsWith(workflowPath + path.sep)) {
            throw new Error('Invalid workflow file path');
          }

          await fs.mkdir(workflowPath, { recursive: true });
          await fs.writeFile(resolvedWorkflowFile, JSON.stringify(workflow.rows[0].workflow_json, null, 2));
        } else {
          throw new Error('Workflow not found');
        }
      }

      // Start the container
      try {
        logger.info(`Starting container ${container.id}`);
        await startContainer(container.id);

        // Update status to running
        await client.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
          ['running', container.id]
        );
        logger.info(`Container ${container.id} started successfully`);

        res.json({
          success: true,
          container: {
            id: container.id,
            name,
            port,
            instanceId,
            status: 'running'
          }
        });
      } catch (startError) {
        logger.error(`Failed to start container ${container.id}:`, startError.message);
        // If start fails, update status to failed
        await client.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
          ['failed', container.id]
        );
        throw startError;
      }
    } catch (innerError) {
      logger.error('Error in container creation process:', {
        error: innerError.message,
        stack: process.env.NODE_ENV === 'development' ? innerError.stack : undefined,
        containerId
      });

      // Rollback: remove container and DB entry on failure
      if (containerId) {
        try {
          logger.info(`Rolling back container ${containerId}`);
          await removeContainer(containerId, true);
          await client.query('DELETE FROM containers WHERE container_id = $1', [containerId]);
          logger.info(`Successfully rolled back container ${containerId}`);
        } catch (rollbackError) {
          logger.error(`Error during rollback of container ${containerId}:`, rollbackError.message);
        }
      }

      // Provide more detailed error message for debugging
      const errorMessage = innerError.message || 'Failed to create container';
      const statusCode = innerError.message && innerError.message.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? innerError.stack : undefined
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error in container creation validation:', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    const errorMessage = error.message || 'Failed to create container';
    res.status(400).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/containers/:id/start - Start a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Request to start container ${id}`);

    await startContainer(id);
    await pool.query(
      'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      ['running', id]
    );

    logger.info(`Container ${id} started successfully`);
    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    logger.error(`Error starting container ${req.params.id}:`, error.message);
    const statusCode = error.message && error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to start container'
    });
  }
});

/**
 * POST /api/containers/:id/stop - Stop a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Request to stop container ${id}`);

    await stopContainer(id);
    await pool.query(
      'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      ['stopped', id]
    );

    logger.info(`Container ${id} stopped successfully`);
    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    logger.error(`Error stopping container ${req.params.id}:`, error.message);
    const statusCode = error.message && error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to stop container'
    });
  }
});

/**
 * POST /api/containers/:id/restart - Restart a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Request to restart container ${id}`);

    await restartContainer(id);
    await pool.query(
      'UPDATE containers SET updated_at = CURRENT_TIMESTAMP WHERE container_id = $1',
      [id]
    );

    logger.info(`Container ${id} restarted successfully`);
    res.json({ success: true, message: 'Container restarted' });
  } catch (error) {
    logger.error(`Error restarting container ${req.params.id}:`, error.message);
    const statusCode = error.message && error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to restart container'
    });
  }
});

/**
 * DELETE /api/containers/:id - Remove a container
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let dockerNotFound = false;

    try {
      await removeContainer(id, true);
    } catch (dockerError) {
      if (dockerError.message && dockerError.message.includes('not found')) {
        dockerNotFound = true;
        logger.warn(`Container ${id} already missing from Docker, cleaning up database entry.`);
      } else {
        throw dockerError;
      }
    }

    await pool.query('DELETE FROM containers WHERE container_id = $1', [id]);

    res.json({
      success: true,
      message: dockerNotFound
        ? 'Container record removed (Docker container was already missing)'
        : 'Container removed'
    });
  } catch (error) {
    logger.error('Error removing container:', error);
    res.status(500).json({ success: false, error: 'Failed to remove container' });
  }
});

/**
 * GET /api/containers/:id/logs - Get container logs
 * Public endpoint - no authentication required for read access
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { tail = 100 } = req.query;
    const tailNum = parseInt(tail, 10);
    // Prevent DoS by bounding tail parameter between 1 and 10000
    const boundedTail = isNaN(tailNum) ? 100 : Math.min(Math.max(tailNum, 1), 10000);
    const logs = await getContainerLogs(id, boundedTail);
    res.json({ success: true, logs });
  } catch (error) {
    logger.error('Error getting logs:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve container logs' });
  }
});

/**
 * GET /api/containers/:id/stats - Get container stats
 * Public endpoint - no authentication required for read access
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number.isInteger(Number(id)) ? Number(id) : null;
    const stats = await getContainerStats(id);
    const summary = summarizeStats(stats);

    const loadResult = await pool.query(
      `SELECT 
       c.max_concurrent_jobs,
       COUNT(caj.id) as active_jobs
      FROM containers c
      LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
        AND caj.status = 'processing'
       WHERE ($1::int IS NOT NULL AND c.id = $1::int) OR c.container_id = $2
       GROUP BY c.id, c.max_concurrent_jobs`,
      [numericId, id]
    );

    const loadInfo = loadResult.rows[0] || { max_concurrent_jobs: 0, active_jobs: 0 };
    const activeJobs = parseInt(loadInfo.active_jobs || 0, 10);

    res.json({
      success: true,
      stats,
      summary,
      load: {
        active_jobs: activeJobs,
        max_concurrent_jobs: loadInfo.max_concurrent_jobs,
        load_percent: loadInfo.max_concurrent_jobs
          ? (activeJobs / loadInfo.max_concurrent_jobs) * 100
          : 0
      }
    });
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve container stats' });
  }
});

module.exports = router;
