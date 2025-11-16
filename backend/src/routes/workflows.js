const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const fs = require('fs').promises;
const path = require('path');

/**
 * GET /api/workflows - Get all workflows
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workflows ORDER BY created_at DESC');
    res.json({ success: true, workflows: result.rows });
  } catch (error) {
    console.error('Error getting workflows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/workflows/:id - Get a specific workflow
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM workflows WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    console.error('Error getting workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows - Create a new workflow
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, workflowJson } = req.body;

    if (!name || !workflowJson) {
      return res.status(400).json({ success: false, error: 'Name and workflow JSON are required' });
    }

    const result = await pool.query(
      'INSERT INTO workflows (name, description, workflow_json) VALUES ($1, $2, $3) RETURNING *',
      [name, description, workflowJson]
    );

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/workflows/:id - Update a workflow
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, workflowJson } = req.body;

    const result = await pool.query(
      'UPDATE workflows SET name = $1, description = $2, workflow_json = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [name, description, workflowJson, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    res.json({ success: true, workflow: result.rows[0] });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/workflows/:id - Delete a workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if workflow is in use
    const inUse = await pool.query('SELECT * FROM containers WHERE workflow_id = $1', [id]);
    if (inUse.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is in use by containers'
      });
    }

    await pool.query('DELETE FROM workflows WHERE id = $1', [id]);
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/workflows/:id/assign/:containerId - Assign workflow to container
 */
router.post('/:id/assign/:containerId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, containerId } = req.params;

    // Update container with workflow ID
    await client.query(
      'UPDATE containers SET workflow_id = $1, updated_at = CURRENT_TIMESTAMP WHERE container_id = $2',
      [id, containerId]
    );

    // Get workflow JSON
    const workflow = await client.query('SELECT workflow_json FROM workflows WHERE id = $1', [id]);

    if (workflow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    // Get container instance ID
    const container = await client.query('SELECT * FROM containers WHERE container_id = $1', [containerId]);
    const instanceId = container.rows[0].id;

    // Write workflow file to container's workflow directory
    const workflowDir = path.join('/app/workflows', `instance-${instanceId}`);
    const workflowFile = path.join(workflowDir, 'workflow.json');

    try {
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(workflowFile, JSON.stringify(workflow.rows[0].workflow_json, null, 2));
    } catch (fsError) {
      console.error('Error writing workflow file:', fsError);
    }

    res.json({ success: true, message: 'Workflow assigned to container' });
  } catch (error) {
    console.error('Error assigning workflow:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
