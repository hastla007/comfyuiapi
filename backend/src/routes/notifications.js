const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Notification types
 */
const NOTIFICATION_TYPES = {
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  BATCH_COMPLETED: 'batch.completed',
  SLA_WARNING: 'sla.warning',
  SLA_VIOLATED: 'sla.violated',
  QUOTA_WARNING: 'quota.warning',
  QUOTA_EXCEEDED: 'quota.exceeded',
  SECURITY_ALERT: 'security.alert',
  SYSTEM_ANNOUNCEMENT: 'system.announcement'
};

/**
 * Create notification schema
 */
const createNotificationSchema = Joi.object({
  type: Joi.string().required(),
  title: Joi.string().min(1).max(255).required(),
  message: Joi.string().max(1000).optional(),
  data: Joi.object().optional()
});

/**
 * Get user notifications
 * GET /api/notifications
 */
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const { is_read, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex}`;
      params.push(is_read === 'true');
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1';
    const countParams = [req.user.id];

    if (is_read !== undefined) {
      countQuery += ' AND is_read = $2';
      countParams.push(is_read === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);

    // Get unread count
    const unreadResult = await pool.query(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        total: parseInt(countResult.rows[0].total),
        unread: parseInt(unreadResult.rows[0].unread)
      }
    });
  } catch (error) {
    logger.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get notifications'
      }
    });
  }
});

/**
 * Get notification by ID
 * GET /api/notifications/:id
 */
router.get('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Notification not found'
        }
      });
    }

    res.json({
      success: true,
      data: { notification: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error getting notification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get notification'
      }
    });
  }
});

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE notifications
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Notification not found'
        }
      });
    }

    res.json({
      success: true,
      data: { notification: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to mark notification as read'
      }
    });
  }
});

/**
 * Mark all notifications as read
 * POST /api/notifications/read-all
 */
router.post('/read-all', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE notifications
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = false
    `, [req.user.id]);

    res.json({
      success: true,
      data: { updated: result.rowCount }
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to mark notifications as read'
      }
    });
  }
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Notification not found'
        }
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete notification'
      }
    });
  }
});

/**
 * Delete all read notifications
 * DELETE /api/notifications/read
 */
router.delete('/bulk/read', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 AND is_read = true',
      [req.user.id]
    );

    res.json({
      success: true,
      data: { deleted: result.rowCount }
    });
  } catch (error) {
    logger.error('Error deleting read notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete notifications'
      }
    });
  }
});

/**
 * Create notification (internal use / admin)
 * POST /api/notifications
 */
router.post('/', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = createNotificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const { type, title, message, data } = value;
    const { user_id } = req.body;

    // If user_id provided, use it (admin creating for another user)
    // Otherwise create for the authenticated user
    const targetUserId = user_id || req.user.id;

    const result = await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [targetUserId, type, title, message, data || null]);

    res.status(201).json({
      success: true,
      data: { notification: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: 'Failed to create notification'
      }
    });
  }
});

/**
 * Get notification statistics
 * GET /api/notifications/meta/stats
 */
router.get('/meta/stats', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        type,
        COUNT(*) as count,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread
      FROM notifications
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY type
      ORDER BY count DESC
    `, [req.user.id]);

    const totalResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as total_unread
      FROM notifications
      WHERE user_id = $1
    `, [req.user.id]);

    res.json({
      success: true,
      data: {
        by_type: result.rows.map(row => ({
          type: row.type,
          count: parseInt(row.count),
          unread: parseInt(row.unread)
        })),
        total: parseInt(totalResult.rows[0].total),
        total_unread: parseInt(totalResult.rows[0].total_unread)
      }
    });
  } catch (error) {
    logger.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_stats_failed',
        message: 'Failed to get notification statistics'
      }
    });
  }
});

/**
 * Helper function to create notification for a user
 * Can be used by other services
 * @param {number} userId - User ID
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 * @returns {Promise<Object>} Created notification
 */
async function createNotification(userId, type, title, message = null, data = null) {
  try {
    const result = await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, type, title, message, data]);

    logger.debug('Notification created', {
      userId,
      type,
      notificationId: result.rows[0].id
    });

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Send notification to multiple users
 * @param {Array} userIds - Array of user IDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 * @returns {Promise<number>} Number of notifications created
 */
async function createBulkNotifications(userIds, type, title, message = null, data = null) {
  const client = await pool.connect();

  try {
    let count = 0;

    for (const userId of userIds) {
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, type, title, message, data]);
      count++;
    }

    logger.info('Bulk notifications created', {
      count,
      type
    });

    return count;
  } finally {
    client.release();
  }
}

// Export helper functions
router.createNotification = createNotification;
router.createBulkNotifications = createBulkNotifications;
router.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

module.exports = router;
