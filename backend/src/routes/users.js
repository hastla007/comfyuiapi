const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/admin/users - List all users
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, credits, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    logger.error('Error listing users:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to list users'
      }
    });
  }
});

/**
 * GET /api/admin/users/:id - Get a specific user
 */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId) || userId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid user ID'
        }
      });
    }

    const result = await pool.query(
      `SELECT id, email, name, credits, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'user_not_found',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to get user'
      }
    });
  }
});

module.exports = router;
