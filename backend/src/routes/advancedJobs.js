const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const batchJobService = require('../services/batchJobService');
const scheduledJobService = require('../services/scheduledJobService');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Batch job creation schema
 */
const batchJobSchema = Joi.object({
  workflow_id: Joi.number().integer().required(),
  jobs: Joi.array().items(Joi.object({
    parameters: Joi.object().required(),
    priority: Joi.number().integer().min(0).max(10).default(0)
  })).min(1).max(100).required(),
  batch_name: Joi.string().max(255).optional()
});

/**
 * Scheduled job creation schema
 */
const scheduledJobSchema = Joi.object({
  workflow_id: Joi.number().integer().required(),
  name: Joi.string().min(2).max(255).required(),
  cron_expression: Joi.string().required(),
  parameters: Joi.object().required(),
  is_active: Joi.boolean().default(true)
});

/**
 * Job template creation schema
 */
const jobTemplateSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(1000).optional(),
  workflow_id: Joi.number().integer().required(),
  parameters: Joi.object().required()
});

// ===================================
// Batch Jobs
// ===================================

/**
 * Create batch job
 * POST /api/advanced-jobs/batch
 */
router.post('/batch', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = batchJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const result = await batchJobService.createBatchJobs(
      value.workflow_id,
      req.user.id,
      value.jobs,
      value.batch_name
    );

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error creating batch job:', error);

    if (error.code === 'WORKFLOW_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'workflow_not_found',
          message: 'Workflow not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'batch_creation_failed',
        message: 'Failed to create batch jobs'
      }
    });
  }
});

/**
 * Get batch job status
 * GET /api/advanced-jobs/batch/:batchId
 */
router.get('/batch/:batchId', authenticateApiKey, async (req, res) => {
  try {
    const { batchId } = req.params;

    const result = await batchJobService.getBatchStatus(batchId, req.user.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting batch status:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Batch not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'get_batch_failed',
        message: 'Failed to get batch status'
      }
    });
  }
});

/**
 * Cancel batch job
 * POST /api/advanced-jobs/batch/:batchId/cancel
 */
router.post('/batch/:batchId/cancel', authenticateApiKey, async (req, res) => {
  try {
    const { batchId } = req.params;

    await batchJobService.cancelBatch(batchId, req.user.id);

    res.json({
      success: true,
      message: 'Batch cancelled successfully'
    });
  } catch (error) {
    logger.error('Error cancelling batch:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Batch not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'cancel_batch_failed',
        message: 'Failed to cancel batch'
      }
    });
  }
});

// ===================================
// Scheduled Jobs
// ===================================

/**
 * Create scheduled job
 * POST /api/advanced-jobs/scheduled
 */
router.post('/scheduled', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = scheduledJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const scheduledJob = await scheduledJobService.createScheduledJob(
      req.user.id,
      value.workflow_id,
      value.name,
      value.cron_expression,
      value.parameters,
      value.is_active
    );

    res.status(201).json({
      success: true,
      data: { scheduledJob }
    });
  } catch (error) {
    logger.error('Error creating scheduled job:', error);

    if (error.code === 'INVALID_CRON') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_cron',
          message: 'Invalid cron expression'
        }
      });
    }

    if (error.code === 'WORKFLOW_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'workflow_not_found',
          message: 'Workflow not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: 'Failed to create scheduled job'
      }
    });
  }
});

/**
 * List scheduled jobs
 * GET /api/advanced-jobs/scheduled
 */
router.get('/scheduled', authenticateApiKey, async (req, res) => {
  try {
    const scheduledJobs = await scheduledJobService.listScheduledJobs(req.user.id);

    res.json({
      success: true,
      data: { scheduledJobs }
    });
  } catch (error) {
    logger.error('Error listing scheduled jobs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list scheduled jobs'
      }
    });
  }
});

/**
 * Get scheduled job by ID
 * GET /api/advanced-jobs/scheduled/:id
 */
router.get('/scheduled/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID is a positive integer
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || !Number.isSafeInteger(numericId) || numericId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_id',
          message: 'Invalid scheduled job ID'
        }
      });
    }

    const scheduledJob = await scheduledJobService.getScheduledJobById(
      numericId,
      req.user.id
    );

    if (!scheduledJob) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Scheduled job not found'
        }
      });
    }

    res.json({
      success: true,
      data: { scheduledJob }
    });
  } catch (error) {
    logger.error('Error getting scheduled job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get scheduled job'
      }
    });
  }
});

/**
 * Update scheduled job
 * PATCH /api/advanced-jobs/scheduled/:id
 */
router.patch('/scheduled/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID is a positive integer
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || !Number.isSafeInteger(numericId) || numericId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_id',
          message: 'Invalid scheduled job ID'
        }
      });
    }

    const { name, cron_expression, parameters, is_active } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (cron_expression) updateData.cron_expression = cron_expression;
    if (parameters) updateData.parameters = parameters;
    if (is_active !== undefined) updateData.is_active = is_active;

    const scheduledJob = await scheduledJobService.updateScheduledJob(
      numericId,
      req.user.id,
      updateData
    );

    res.json({
      success: true,
      data: { scheduledJob }
    });
  } catch (error) {
    logger.error('Error updating scheduled job:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Scheduled job not found'
        }
      });
    }

    if (error.code === 'INVALID_CRON') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_cron',
          message: 'Invalid cron expression'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update scheduled job'
      }
    });
  }
});

/**
 * Delete scheduled job
 * DELETE /api/advanced-jobs/scheduled/:id
 */
router.delete('/scheduled/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID is a positive integer
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || !Number.isSafeInteger(numericId) || numericId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_id',
          message: 'Invalid scheduled job ID'
        }
      });
    }

    await scheduledJobService.deleteScheduledJob(numericId, req.user.id);

    res.json({
      success: true,
      message: 'Scheduled job deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting scheduled job:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Scheduled job not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete scheduled job'
      }
    });
  }
});

// ===================================
// Job Templates
// ===================================

/**
 * Create job template
 * POST /api/advanced-jobs/templates
 */
router.post('/templates', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = jobTemplateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    // Check if workflow exists
    const workflowCheck = await pool.query(
      'SELECT id FROM workflows WHERE id = $1',
      [value.workflow_id]
    );

    if (workflowCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'workflow_not_found',
          message: 'Workflow not found'
        }
      });
    }

    const result = await pool.query(`
      INSERT INTO job_templates (user_id, name, description, workflow_id, parameters)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, value.name, value.description || null, value.workflow_id, value.parameters]);

    logger.info('Job template created', {
      templateId: result.rows[0].id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: { template: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error creating job template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: 'Failed to create job template'
      }
    });
  }
});

/**
 * List job templates
 * GET /api/advanced-jobs/templates
 */
router.get('/templates', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT jt.*, w.name as workflow_name
      FROM job_templates jt
      LEFT JOIN workflows w ON jt.workflow_id = w.id
      WHERE jt.user_id = $1
      ORDER BY jt.created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { templates: result.rows }
    });
  } catch (error) {
    logger.error('Error listing job templates:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list job templates'
      }
    });
  }
});

/**
 * Get job template by ID
 * GET /api/advanced-jobs/templates/:id
 */
router.get('/templates/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT jt.*, w.name as workflow_name, w.workflow_json
      FROM job_templates jt
      LEFT JOIN workflows w ON jt.workflow_id = w.id
      WHERE jt.id = $1 AND jt.user_id = $2
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job template not found'
        }
      });
    }

    res.json({
      success: true,
      data: { template: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error getting job template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get job template'
      }
    });
  }
});

/**
 * Update job template
 * PATCH /api/advanced-jobs/templates/:id
 */
router.patch('/templates/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parameters } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }

    if (parameters) {
      updates.push(`parameters = $${paramIndex}`);
      values.push(parameters);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'no_updates',
          message: 'No valid fields to update'
        }
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, req.user.id);

    const query = `
      UPDATE job_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job template not found'
        }
      });
    }

    logger.info('Job template updated', {
      templateId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: { template: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error updating job template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update job template'
      }
    });
  }
});

/**
 * Delete job template
 * DELETE /api/advanced-jobs/templates/:id
 */
router.delete('/templates/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM job_templates WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job template not found'
        }
      });
    }

    logger.info('Job template deleted', {
      templateId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Job template deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting job template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete job template'
      }
    });
  }
});

/**
 * Create job from template
 * POST /api/advanced-jobs/templates/:id/execute
 */
router.post('/templates/:id/execute', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { parameterOverrides } = req.body;

    // Get template
    const templateResult = await pool.query(
      'SELECT * FROM job_templates WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job template not found'
        }
      });
    }

    const template = templateResult.rows[0];

    // Merge parameters with overrides
    const parameters = {
      ...template.parameters,
      ...(parameterOverrides || {})
    };

    // Create job
    const jobResult = await pool.query(`
      INSERT INTO jobs (workflow_id, user_id, parameters, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING *
    `, [template.workflow_id, req.user.id, parameters]);

    logger.info('Job created from template', {
      templateId: id,
      jobId: jobResult.rows[0].id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: { job: jobResult.rows[0] }
    });
  } catch (error) {
    logger.error('Error executing template:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'execution_failed',
        message: 'Failed to execute template'
      }
    });
  }
});

module.exports = router;
