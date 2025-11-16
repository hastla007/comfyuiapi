const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const jobProcessor = require('../services/jobProcessor');
const { requireAdmin, authenticateApiKey } = require('../middleware/auth');

/**
 * Create a new job
 * POST /api/jobs
 */
router.post('/', authenticateApiKey, async (req, res) => {
  try {
    const {
      workflow_id,
      container_id,
      priority = 0,
      parameters = {}
    } = req.body;

    // Validation
    if (!workflow_id) {
      return res.status(400).json({ error: 'workflow_id is required' });
    }

    if (typeof parameters !== 'object' || Array.isArray(parameters)) {
      return res.status(400).json({ error: 'parameters must be an object' });
    }

    // Validate workflow exists
    const workflowResult = await pool.query(
      'SELECT id FROM workflows WHERE id = $1',
      [workflow_id]
    );

    if (workflowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // If container_id specified, validate it exists and is running
    if (container_id) {
      const containerResult = await pool.query(
        'SELECT id FROM containers WHERE id = $1',
        [container_id]
      );

      if (containerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Container not found' });
      }
    }

    // Create job
    const result = await pool.query(`
      INSERT INTO jobs (workflow_id, container_id, priority, parameters, status)
      VALUES ($1, $2, $3, $4, 'queued')
      RETURNING *
    `, [workflow_id, container_id, priority, JSON.stringify(parameters)]);

    const job = result.rows[0];

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        workflow_id: job.workflow_id,
        container_id: job.container_id,
        status: job.status,
        priority: job.priority,
        parameters: job.parameters,
        created_at: job.created_at
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job', details: error.message });
  }
});

/**
 * Get queue status with stats
 * GET /api/jobs/queue
 */
router.get('/queue', authenticateApiKey, async (req, res) => {
  try {
    // Get active queue items (pending and processing)
    const queueResult = await pool.query(`
      SELECT j.*, w.name as workflow_name, c.name as container_name
      FROM jobs j
      LEFT JOIN workflows w ON j.workflow_id = w.id
      LEFT JOIN containers c ON j.container_id = c.id
      WHERE j.status IN ('queued', 'processing')
      ORDER BY j.priority DESC, j.created_at ASC
    `);

    // Get stats by status
    const statsResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM jobs
      WHERE status IN ('queued', 'processing', 'completed', 'failed')
        AND created_at > NOW() - INTERVAL '1 day'
      GROUP BY status
    `);

    const stats = {};
    statsResult.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
    });

    res.json({
      success: true,
      queue: queueResult.rows.map(job => ({
        id: job.id,
        workflow_id: job.workflow_id,
        workflow_name: job.workflow_name,
        container_id: job.container_id,
        container_name: job.container_name,
        status: job.status,
        priority: job.priority,
        progress: job.progress,
        created_at: job.created_at,
        started_at: job.started_at
      })),
      stats: {
        pending: stats.queued || 0,
        processing: stats.processing || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0
      }
    });
  } catch (error) {
    console.error('Error getting queue:', error);
    res.status(500).json({ error: 'Failed to get queue', details: error.message });
  }
});

/**
 * Get job status
 * GET /api/jobs/:id
 */
router.get('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT j.*, w.name as workflow_name, c.name as container_name
      FROM jobs j
      LEFT JOIN workflows w ON j.workflow_id = w.id
      LEFT JOIN containers c ON j.container_id = c.id
      WHERE j.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    res.json({
      id: job.id,
      workflow_id: job.workflow_id,
      workflow_name: job.workflow_name,
      container_id: job.container_id,
      container_name: job.container_name,
      status: job.status,
      priority: job.priority,
      parameters: job.parameters,
      input_image_url: job.input_image_url,
      output_image_url: job.output_image_url,
      comfyui_prompt_id: job.comfyui_prompt_id,
      error_message: job.error_message,
      progress: job.progress,
      created_at: job.created_at,
      updated_at: job.updated_at,
      started_at: job.started_at,
      completed_at: job.completed_at
    });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({ error: 'Failed to get job', details: error.message });
  }
});

/**
 * List jobs
 * GET /api/jobs
 */
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
      workflow_id
    } = req.query;

    // Build query
    let query = `
      SELECT j.*, w.name as workflow_name, c.name as container_name
      FROM jobs j
      LEFT JOIN workflows w ON j.workflow_id = w.id
      LEFT JOIN containers c ON j.container_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND j.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (workflow_id) {
      query += ` AND j.workflow_id = $${paramIndex}`;
      params.push(workflow_id);
      paramIndex++;
    }

    query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM jobs WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (workflow_id) {
      countQuery += ` AND workflow_id = $${countParamIndex}`;
      countParams.push(workflow_id);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Get stats by status
    const statsResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM jobs
      GROUP BY status
    `);

    const byStatus = {};
    statsResult.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count);
    });

    // Get timeline data for last 7 days
    const timelineResult = await pool.query(`
      SELECT DATE(created_at) as date,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM jobs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      success: true,
      jobs: result.rows.map(job => ({
        id: job.id,
        workflow_id: job.workflow_id,
        workflow_name: job.workflow_name,
        container_id: job.container_id,
        container_name: job.container_name,
        status: job.status,
        priority: job.priority,
        progress: job.progress,
        output_image_url: job.output_image_url,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        duration: job.completed_at && job.started_at
          ? `${Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)}s`
          : null
      })),
      stats: {
        total,
        completed: byStatus.completed || 0,
        failed: byStatus.failed || 0,
        processing: byStatus.processing || 0,
        pending: byStatus.queued || 0,
        byStatus,
        timeline: timelineResult.rows.map(row => ({
          date: row.date.toISOString().split('T')[0],
          completed: parseInt(row.completed),
          failed: parseInt(row.failed)
        }))
      },
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({ error: 'Failed to list jobs', details: error.message });
  }
});

/**
 * Cancel a job
 * POST /api/jobs/:id/cancel
 */
router.post('/:id/cancel', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Check job exists and is cancellable
    const result = await pool.query(
      'SELECT id, status FROM jobs WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    if (!['queued', 'processing'].includes(job.status)) {
      return res.status(400).json({
        error: 'Job cannot be cancelled',
        details: `Job is already ${job.status}`
      });
    }

    // Cancel the job
    await jobProcessor.cancelJob(parseInt(id));

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job', details: error.message });
  }
});

/**
 * Retry a failed job
 * POST /api/jobs/:id/retry
 */
router.post('/:id/retry', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Check job exists and is failed
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    if (job.status !== 'failed') {
      return res.status(400).json({
        error: 'Only failed jobs can be retried',
        details: `Job status is ${job.status}`
      });
    }

    // Reset job to queued
    await pool.query(`
      UPDATE jobs
      SET status = 'queued',
          error_message = NULL,
          started_at = NULL,
          completed_at = NULL,
          progress = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    res.json({
      success: true,
      message: 'Job requeued successfully'
    });
  } catch (error) {
    console.error('Error retrying job:', error);
    res.status(500).json({ error: 'Failed to retry job', details: error.message });
  }
});

/**
 * Get job processor stats
 * GET /api/jobs/stats/processor
 */
router.get('/stats/processor', authenticateApiKey, async (req, res) => {
  try {
    // Get processor stats
    const processorStats = jobProcessor.getStats();

    // Get job counts by status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM jobs
      GROUP BY status
    `);

    const statusCounts = {};
    statusResult.rows.forEach(row => {
      statusCounts[row.status] = parseInt(row.count);
    });

    // Get average processing time
    const avgTimeResult = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
      FROM jobs
      WHERE status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
    `);

    const avgProcessingTime = avgTimeResult.rows[0].avg_seconds
      ? parseFloat(avgTimeResult.rows[0].avg_seconds).toFixed(2)
      : 0;

    res.json({
      processor: processorStats,
      queue: statusCounts,
      metrics: {
        average_processing_time_seconds: parseFloat(avgProcessingTime)
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

/**
 * Delete old completed/failed jobs (Admin only)
 * DELETE /api/jobs/cleanup
 */
router.delete('/cleanup', requireAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Validate days parameter
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        details: 'days must be between 1 and 365'
      });
    }

    // Use parameterized query to prevent SQL injection
    const result = await pool.query(`
      DELETE FROM jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND completed_at < NOW() - INTERVAL '1 day' * $1
    `, [daysNum]);

    res.json({
      success: true,
      deleted: result.rowCount
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: error.message });
  }
});

module.exports = router;
