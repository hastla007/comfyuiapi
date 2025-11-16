const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../database');
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
        ...dbContainer
      };
    });

    res.json({ success: true, containers });
  } catch (error) {
    console.error('Error getting containers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/containers - Create a new container
 */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  let containerId = null;

  try {
    const { name, port, workflowId } = req.body;

    // Validate input
    if (!name || !port) {
      return res.status(400).json({ success: false, error: 'Name and port are required' });
    }

    // Validate port range
    if (port < 1024 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Port must be between 1024-65535'
      });
    }

    // Check if port is already in use
    const portCheck = await client.query('SELECT * FROM containers WHERE port = $1', [port]);
    if (portCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Port already in use' });
    }

    // Get next instance ID
    const result = await client.query('SELECT MAX(id) as max_id FROM containers');
    const instanceId = (result.rows[0].max_id || 0) + 1;

    // Create Docker container
    const container = await createContainer({
      name,
      port,
      instanceId,
      workflowPath: `/app/workflows/instance-${instanceId}`
    });
    containerId = container.id;

    // Save to database
    await client.query(
      'INSERT INTO containers (container_id, name, port, status, workflow_id) VALUES ($1, $2, $3, $4, $5)',
      [container.id, name, port, 'created', workflowId]
    );

    // If workflowId is provided, write workflow file to container's directory
    if (workflowId) {
      try {
        const workflow = await client.query('SELECT workflow_json FROM workflows WHERE id = $1', [workflowId]);
        if (workflow.rows.length > 0) {
          const workflowDir = path.join('/app/workflows', `instance-${instanceId}`);
          const workflowFile = path.join(workflowDir, 'workflow.json');
          await fs.mkdir(workflowDir, { recursive: true });
          await fs.writeFile(workflowFile, JSON.stringify(workflow.rows[0].workflow_json, null, 2));
        }
      } catch (fsError) {
        console.error('Error writing workflow file during container creation:', fsError);
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
  } catch (error) {
    console.error('Error creating container:', error);

    // Rollback: remove container and DB entry on failure
    if (containerId) {
      try {
        await removeContainer(containerId, true);
        await client.query('DELETE FROM containers WHERE container_id = $1', [containerId]);
        console.log(`Rolled back container ${containerId} due to error`);
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }

    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/containers/:id/start - Start a container
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
    console.error('Error starting container:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/containers/:id/stop - Stop a container
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
    console.error('Error stopping container:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/containers/:id/restart - Restart a container
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
    console.error('Error restarting container:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/containers/:id - Remove a container
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await removeContainer(id, true);
    await pool.query('DELETE FROM containers WHERE container_id = $1', [id]);
    res.json({ success: true, message: 'Container removed' });
  } catch (error) {
    console.error('Error removing container:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/containers/:id/logs - Get container logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { tail = 100 } = req.query;
    const tailNum = parseInt(tail, 10);
    const logs = await getContainerLogs(id, isNaN(tailNum) ? 100 : tailNum);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/containers/:id/stats - Get container stats
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await getContainerStats(id);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
