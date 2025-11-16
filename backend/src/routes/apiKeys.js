const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const {
  createApiKey,
  revokeApiKey,
  listApiKeys,
  requireAdmin
} = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/admin/api-keys - Create a new API key
 * This is a protected endpoint that should only be accessible to administrators
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, name, keyName, permissions, rateLimit, expiresAt } = req.body;

    // Validation
    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'email is required'
        }
      });
    }

    // Check if user exists, create if not
    let userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    let userId;
    if (userResult.rows.length === 0) {
      // Create new user
      const newUser = await pool.query(
        'INSERT INTO users (email, name, credits) VALUES ($1, $2, $3) RETURNING id',
        [email, name || null, 0]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Create API key
    const apiKeyData = await createApiKey(
      userId,
      keyName || null,
      permissions || null,
      rateLimit || 100,
      expiresAt || null
    );

    res.status(201).json({
      success: true,
      api_key: apiKeyData.apiKey, // Only shown once
      key_id: apiKeyData.id,
      key_prefix: apiKeyData.key_prefix,
      name: apiKeyData.name,
      created_at: apiKeyData.created_at,
      message: 'Save this API key securely. It will not be shown again.'
    });
  } catch (error) {
    logger.error('Error creating API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create API key'
      }
    });
  }
});

/**
 * GET /api/admin/api-keys/:userId - List API keys for a user
 */
router.get('/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId) || userId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid user ID'
        }
      });
    }

    const keys = await listApiKeys(userId);

    res.json({
      success: true,
      api_keys: keys
    });
  } catch (error) {
    logger.error('Error listing API keys:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to list API keys'
      }
    });
  }
});

/**
 * DELETE /api/admin/api-keys/:keyId - Revoke an API key
 */
router.delete('/:keyId', requireAdmin, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId, 10);

    if (isNaN(keyId) || keyId < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid key ID'
        }
      });
    }

    const revoked = await revokeApiKey(keyId);

    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'key_not_found',
          message: 'API key not found'
        }
      });
    }

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    logger.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to revoke API key'
      }
    });
  }
});

module.exports = router;
