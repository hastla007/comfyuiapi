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
      return {
        id: dc.Id,
        name: (dc.Names && dc.Names[0]) ? dc.Names[0].replace('/', '') : 'unknown',
        status: dc.State,
        ports: dc.Ports,
        created: dc.Created,
        ...(dbContainer || {})
      };
    });

    res.json({ success: true, containers });
  } catch (error) {
    logger.error('Error getting containers:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve containers' });
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
      const container = await createContainer({
        name,
        port,
        instanceId,
        workflowPath
      });
      containerId = container.id;

      // Save to database
      await client.query(
        'INSERT INTO containers (container_id, name, port, status, workflow_id) VALUES ($1, $2, $3, $4, $5)',
        [container.id, name, port, 'created', workflowId]
      );

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
        await startContainer(container.id);

        // Update status to running
        await client.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
          ['running', container.id]
        );

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
        // If start fails, update status to failed
        await client.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
          ['failed', container.id]
        );
        throw startError;
      }
    } catch (innerError) {
      logger.error('Error creating container:', innerError);

      // Rollback: remove container and DB entry on failure
      if (containerId) {
        try {
          await removeContainer(containerId, true);
          await client.query('DELETE FROM containers WHERE container_id = $1', [containerId]);
          logger.info(`Rolled back container ${containerId} due to error`);
        } catch (rollbackError) {
          logger.error('Error during rollback:', rollbackError);
        }
      }

      res.status(500).json({ success: false, error: 'Failed to create container' });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error in container creation validation:', error);
    res.status(500).json({ success: false, error: 'Failed to create container' });
  }
});

/**
 * POST /api/containers/:id/start - Start a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    await startContainer(id);
    await pool.query(
      'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      ['running', id]
    );
    res.json({ success: true, message: 'Container started' });
  } catch (error) {
    logger.error('Error starting container:', error);
    res.status(500).json({ success: false, error: 'Failed to start container' });
  }
});

/**
 * POST /api/containers/:id/stop - Stop a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await stopContainer(id);
    await pool.query(
      'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      ['stopped', id]
    );
    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    logger.error('Error stopping container:', error);
    res.status(500).json({ success: false, error: 'Failed to stop container' });
  }
});

/**
 * POST /api/containers/:id/restart - Restart a container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    await restartContainer(id);
    await pool.query(
      'UPDATE containers SET updated_at = CURRENT_TIMESTAMP WHERE container_id = $1',
      [id]
    );
    res.json({ success: true, message: 'Container restarted' });
  } catch (error) {
    logger.error('Error restarting container:', error);
    res.status(500).json({ success: false, error: 'Failed to restart container' });
  }
});

/**
 * DELETE /api/containers/:id - Remove a container
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await removeContainer(id, true);
    await pool.query('DELETE FROM containers WHERE container_id = $1', [id]);
    res.json({ success: true, message: 'Container removed' });
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
    const stats = await getContainerStats(id);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve container stats' });
  }
});

module.exports = router;
