const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const {
  createApiKey,
  revokeApiKey,
  listApiKeys
} = require('../middleware/auth');

/**
 * POST /api/admin/api-keys - Create a new API key
 * This is a protected endpoint that should only be accessible to administrators
 * In production, add proper admin authentication middleware
 */
router.post('/', async (req, res) => {
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
    console.error('Error creating API key:', error);
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
router.get('/:userId', async (req, res) => {
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
    console.error('Error listing API keys:', error);
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
router.delete('/:keyId', async (req, res) => {
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
    console.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to revoke API key'
      }
    });
  }
});

/**
 * GET /api/admin/users - List all users
 */
router.get('/users/list', async (req, res) => {
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
    console.error('Error listing users:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to list users'
      }
    });
  }
});

module.exports = router;
