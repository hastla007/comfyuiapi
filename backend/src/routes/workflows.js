const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateApiKey, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * GET /api/workflows - Get all workflows
 * Public endpoint - no authentication required for read access
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workflows ORDER BY created_at DESC');
    res.json({ success: true, workflows: result.rows });
  } catch (error) {
    logger.error('Error getting workflows:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflows' });
  }
});

/**
 * GET /api/workflows/:id - Get a specific workflow
 * Public endpoint - no authentication required for read access
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid workflow ID' });
    }
    const result = await pool.query('SELECT * FROM workflows WHERE id = $1', [numericId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    logger.error('Error getting workflow:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflow' });
  }
});

/**
 * POST /api/workflows - Create a new workflow
 * Public endpoint - no authentication required for frontend access
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, workflowJson } = req.body;

    if (!name || !workflowJson) {
      return res.status(400).json({ success: false, error: 'Name and workflow JSON are required' });
    }

    // Validate name length (max 255 characters for VARCHAR(255))
    if (typeof name !== 'string' || name.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Workflow name must be a string with max 255 characters'
      });
    }

    // Validate workflow JSON size (max 5MB)
    const jsonString = JSON.stringify(workflowJson);
    const jsonSizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB

    if (jsonSizeBytes > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        error: 'Workflow JSON too large (max 5MB)'
      });
    }

    // Validate workflow JSON is an object
    if (typeof workflowJson !== 'object' || workflowJson === null) {
      return res.status(400).json({
        success: false,
        error: 'Workflow JSON must be a valid object'
      });
    }

    const result = await pool.query(
      'INSERT INTO workflows (name, description, workflow_json) VALUES ($1, $2, $3) RETURNING *',
      [name, description, workflowJson]
    );

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    logger.error('Error creating workflow:', error);
    res.status(500).json({ success: false, error: 'Failed to create workflow' });
  }
});

/**
 * PUT /api/workflows/:id - Update a workflow
 */
router.put('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid workflow ID' });
    }
    const { name, description, workflowJson } = req.body;

    if (!name || !workflowJson) {
      return res.status(400).json({
        success: false,
        error: 'Name and workflow JSON are required'
      });
    }

    // Validate name length (max 255 characters for VARCHAR(255))
    if (typeof name !== 'string' || name.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Workflow name must be a string with max 255 characters'
      });
    }

    // Validate workflow JSON size (max 5MB)
    const jsonString = JSON.stringify(workflowJson);
    const jsonSizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB

    if (jsonSizeBytes > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        error: 'Workflow JSON too large (max 5MB)'
      });
    }

    // Validate workflow JSON is an object
    if (typeof workflowJson !== 'object' || workflowJson === null) {
      return res.status(400).json({
        success: false,
        error: 'Workflow JSON must be a valid object'
      });
    }

    const result = await pool.query(
      'UPDATE workflows SET name = $1, description = $2, workflow_json = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [name, description, workflowJson, numericId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    logger.error('Error updating workflow:', error);
    res.status(500).json({ success: false, error: 'Failed to update workflow' });
  }
});

/**
 * DELETE /api/workflows/:id - Delete a workflow
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid workflow ID' });
    }

    // Check if workflow is in use
    const inUse = await pool.query('SELECT * FROM containers WHERE workflow_id = $1', [numericId]);
    if (inUse.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is in use by containers'
      });
    }

    await pool.query('DELETE FROM workflows WHERE id = $1', [numericId]);
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    logger.error('Error deleting workflow:', error);
    res.status(500).json({ success: false, error: 'Failed to delete workflow' });
  }
});

/**
 * POST /api/workflows/:id/assign/:containerId - Assign workflow to container
 * Public endpoint - no authentication required for frontend access
 */
router.post('/:id/assign/:containerId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, containerId } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId < 1) {
      client.release();
      return res.status(400).json({ success: false, error: 'Invalid workflow ID' });
    }

    // Validate containerId format (Docker container IDs are 12-64 hex characters)
    if (!containerId || !/^[a-f0-9]{12,64}$/i.test(containerId)) {
      client.release();
      return res.status(400).json({ success: false, error: 'Invalid container ID format' });
    }

    // Use transaction for atomicity
    await client.query('BEGIN');

    // Get container instance ID first to verify it exists
    const container = await client.query('SELECT * FROM containers WHERE container_id = $1', [containerId]);

    if (container.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    const instanceId = container.rows[0].id;

    // Update container with workflow ID
    await client.query(
      'UPDATE containers SET workflow_id = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      [numericId, containerId]
    );

    // Get workflow JSON
    const workflow = await client.query('SELECT workflow_json FROM workflows WHERE id = $1', [numericId]);

    if (workflow.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    // Validate and sanitize instance ID to prevent path traversal
    if (!Number.isSafeInteger(instanceId) || instanceId < 1 || instanceId > 100000) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(500).json({
        success: false,
        error: 'Invalid instance ID'
      });
    }

    const sanitizedId = Math.floor(instanceId);

    // Construct and validate workflow path to prevent path traversal
    const workflowDir = path.resolve('/app/workflows', `instance-${sanitizedId}`);

    // Verify the resolved path is still within /app/workflows
    if (!workflowDir.startsWith('/app/workflows/')) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(500).json({
        success: false,
        error: 'Invalid workflow path'
      });
    }

    const workflowFile = path.join(workflowDir, 'workflow.json');

    // Additional safety check: ensure workflowFile is within workflowDir
    const resolvedWorkflowFile = path.resolve(workflowFile);
    if (!resolvedWorkflowFile.startsWith(workflowDir + path.sep)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(500).json({
        success: false,
        error: 'Invalid workflow file path'
      });
    }

    try {
      // Ensure workflow directory exists
      await fs.mkdir(workflowDir, { recursive: true });

      // Clear all existing workflow files in the directory (1 instance = 1 workflow)
      try {
        const files = await fs.readdir(workflowDir);
        for (const file of files) {
          const filePath = path.join(workflowDir, file);
          // Only delete workflow JSON files
          if (file.endsWith('.json')) {
            await fs.unlink(filePath);
            logger.info(`Deleted old workflow file: ${filePath}`);
          }
        }
      } catch (cleanupError) {
        // If directory doesn't exist or is empty, that's fine
        if (cleanupError.code !== 'ENOENT') {
          logger.warn('Error cleaning workflow directory:', cleanupError);
        }
      }

      // Write the new workflow file
      await fs.writeFile(resolvedWorkflowFile, JSON.stringify(workflow.rows[0].workflow_json, null, 2));
      logger.info(`Workflow assigned to container ${containerId}, instance ${instanceId}`);

      // Commit transaction on success
      await client.query('COMMIT');
      res.json({ success: true, message: 'Workflow assigned to container' });
    } catch (fsError) {
      logger.error('Error writing workflow file:', fsError);
      await client.query('ROLLBACK');
      throw fsError;
    }
  } catch (error) {
    logger.error('Error assigning workflow:', error);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Error rolling back transaction:', rollbackError);
    }
    const errorMessage = error.message || 'Failed to assign workflow to container';
    res.status(500).json({
      success: false,
      error: 'Failed to assign workflow to container',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  } finally {
    client.release();
  }
});

module.exports = router;
