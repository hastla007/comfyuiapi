const express = require('express');
const router = express.Router();
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
        name: dc.Names[0].replace('/', ''),
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
  let containerCreated = false;

  try {
    const { name, port, workflowId, enableGPU = true } = req.body;

    // Validate input
    if (!name || !port) {
      return res.status(400).json({ success: false, error: 'Name and port are required' });
    }

    // Validate port range (avoid privileged ports)
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Port must be between 1024 and 65535'
      });
    }

    // Check if port is already in use
    const portCheck = await client.query('SELECT * FROM containers WHERE port = $1', [portNum]);
    if (portCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Port already in use' });
    }

    // Begin transaction
    await client.query('BEGIN');

    // Get next instance ID
    const result = await client.query('SELECT MAX(id) as max_id FROM containers');
    const instanceId = (result.rows[0].max_id || 0) + 1;

    // Create Docker container
    const container = await createContainer({
      name,
      port: portNum,
      instanceId,
      workflowPath: `/app/workflows/instance-${instanceId}`,
      enableGPU
    });

    containerId = container.id;
    containerCreated = true;

    // Save to database
    await client.query(
      'INSERT INTO containers (container_id, name, port, status, workflow_id) VALUES ($1, $2, $3, $4, $5)',
      [container.id, name, portNum, 'created', workflowId]
    );

    // Start the container
    try {
      await startContainer(container.id);

      // Update status to running
      await client.query(
        'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
        ['running', container.id]
      );

      // Commit transaction
      await client.query('COMMIT');

      res.json({
        success: true,
        container: {
          id: container.id,
          name,
          port: portNum,
          instanceId,
          status: 'running'
        }
      });
    } catch (startError) {
      // Rollback: container was created but failed to start
      console.error('Failed to start container:', startError);

      // Rollback database transaction
      await client.query('ROLLBACK');

      // Remove the container
      await removeContainer(container.id, true).catch(err => {
        console.error('Failed to cleanup container:', err);
      });

      throw new Error(`Container created but failed to start: ${startError.message}`);
    }
  } catch (error) {
    console.error('Error creating container:', error);

    // Rollback database if in transaction
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Transaction may not be active
    }

    // Cleanup: Remove container if it was created
    if (containerCreated && containerId) {
      await removeContainer(containerId, true).catch(err => {
        console.error('Failed to cleanup container after error:', err);
      });
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
    const logs = await getContainerLogs(id, parseInt(tail));
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
