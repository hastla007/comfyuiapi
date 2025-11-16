const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const autoScaler = require('../services/autoScaler');
const { authenticateApiKey } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Container pool creation schema
 */
const createPoolSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  min_containers: Joi.number().integer().min(0).max(100).default(1),
  max_containers: Joi.number().integer().min(1).max(100).default(10),
  target_queue_depth: Joi.number().integer().min(1).default(5),
  scale_up_threshold: Joi.number().integer().min(1).default(3),
  scale_down_threshold: Joi.number().integer().min(0).default(1),
  idle_timeout_minutes: Joi.number().integer().min(1).default(30)
});

/**
 * Create container pool
 * POST /api/container-pools
 */
router.post('/', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createPoolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    // Validate min <= max
    if (value.min_containers > value.max_containers) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_range',
          message: 'min_containers cannot be greater than max_containers'
        }
      });
    }

    const result = await pool.query(`
      INSERT INTO container_pools (
        name, min_containers, max_containers, target_queue_depth,
        scale_up_threshold, scale_down_threshold, idle_timeout_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      value.name,
      value.min_containers,
      value.max_containers,
      value.target_queue_depth,
      value.scale_up_threshold,
      value.scale_down_threshold,
      value.idle_timeout_minutes
    ]);

    logger.info('Container pool created', {
      poolId: result.rows[0].id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: { pool: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error creating container pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: 'Failed to create container pool'
      }
    });
  }
});

/**
 * List container pools
 * GET /api/container-pools
 */
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        cp.*,
        (SELECT COUNT(*) FROM containers WHERE pool_id = cp.id AND status = 'running') as current_containers,
        (SELECT COUNT(*) FROM containers WHERE pool_id = cp.id AND status = 'running'
         AND last_activity_at < NOW() - INTERVAL '1 minute' * cp.idle_timeout_minutes) as idle_containers
      FROM container_pools cp
      ORDER BY cp.created_at DESC
    `);

    res.json({
      success: true,
      data: { pools: result.rows }
    });
  } catch (error) {
    logger.error('Error listing container pools:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list container pools'
      }
    });
  }
});

/**
 * Get container pool by ID
 * GET /api/container-pools/:id
 */
router.get('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const metrics = await autoScaler.getPoolMetrics(parseInt(id));

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Container pool not found'
        }
      });
    }

    res.json({
      success: true,
      data: { pool: metrics }
    });
  } catch (error) {
    logger.error('Error getting container pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get container pool'
      }
    });
  }
});

/**
 * Update container pool
 * PATCH /api/container-pools/:id
 */
router.patch('/:id', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      min_containers,
      max_containers,
      target_queue_depth,
      scale_up_threshold,
      scale_down_threshold,
      idle_timeout_minutes
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (min_containers !== undefined) {
      updates.push(`min_containers = $${paramIndex}`);
      values.push(min_containers);
      paramIndex++;
    }

    if (max_containers !== undefined) {
      updates.push(`max_containers = $${paramIndex}`);
      values.push(max_containers);
      paramIndex++;
    }

    if (target_queue_depth !== undefined) {
      updates.push(`target_queue_depth = $${paramIndex}`);
      values.push(target_queue_depth);
      paramIndex++;
    }

    if (scale_up_threshold !== undefined) {
      updates.push(`scale_up_threshold = $${paramIndex}`);
      values.push(scale_up_threshold);
      paramIndex++;
    }

    if (scale_down_threshold !== undefined) {
      updates.push(`scale_down_threshold = $${paramIndex}`);
      values.push(scale_down_threshold);
      paramIndex++;
    }

    if (idle_timeout_minutes !== undefined) {
      updates.push(`idle_timeout_minutes = $${paramIndex}`);
      values.push(idle_timeout_minutes);
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
    values.push(id);

    const query = `
      UPDATE container_pools
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Container pool not found'
        }
      });
    }

    logger.info('Container pool updated', {
      poolId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: { pool: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error updating container pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update container pool'
      }
    });
  }
});

/**
 * Delete container pool
 * DELETE /api/container-pools/:id
 */
router.delete('/:id', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM container_pools WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Container pool not found'
        }
      });
    }

    logger.info('Container pool deleted', {
      poolId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Container pool deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting container pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete container pool'
      }
    });
  }
});

/**
 * Manually scale pool
 * POST /api/container-pools/:id/scale
 */
router.post('/:id/scale', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { target_count } = req.body;

    if (!target_count || target_count < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_target',
          message: 'target_count must be a positive number'
        }
      });
    }

    await autoScaler.manualScale(parseInt(id), target_count);

    logger.info('Manual scaling triggered', {
      poolId: id,
      targetCount: target_count,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Scaling operation triggered'
    });
  } catch (error) {
    logger.error('Error scaling pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'scaling_failed',
        message: 'Failed to scale pool'
      }
    });
  }
});

/**
 * Get scaling events for pool
 * GET /api/container-pools/:id/events
 */
router.get('/:id/events', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT * FROM scaling_events
      WHERE pool_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM scaling_events WHERE pool_id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        events: result.rows,
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    logger.error('Error getting scaling events:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_events_failed',
        message: 'Failed to get scaling events'
      }
    });
  }
});

/**
 * Get containers in pool
 * GET /api/container-pools/:id/containers
 */
router.get('/:id/containers', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM containers
      WHERE pool_id = $1
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: { containers: result.rows }
    });
  } catch (error) {
    logger.error('Error getting pool containers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_containers_failed',
        message: 'Failed to get containers'
      }
    });
  }
});

module.exports = router;
