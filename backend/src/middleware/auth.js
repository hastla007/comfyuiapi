const crypto = require('crypto');
const { pool } = require('../database');

/**
 * Middleware to authenticate API requests using Bearer token
 */
async function authenticateApiKey(req, res, next) {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'authentication_failed',
          message: 'Missing Authorization header'
        }
      });
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'authentication_failed',
          message: 'Invalid Authorization header format. Expected: Bearer <token>'
        }
      });
    }

    const apiKey = parts[1];

    // Validate API key format (should be at least 32 characters)
    if (!apiKey || apiKey.length < 32) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'authentication_failed',
          message: 'Invalid API key format'
        }
      });
    }

    // Hash the API key to compare with stored hash
    const keyHash = hashApiKey(apiKey);

    // Look up API key in database
    const result = await pool.query(
      `SELECT ak.*, u.email, u.name, u.credits
       FROM api_keys ak
       LEFT JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = $1 AND ak.is_active = true`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'authentication_failed',
          message: 'Invalid or inactive API key'
        }
      });
    }

    const keyData = result.rows[0];

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'authentication_failed',
          message: 'API key has expired'
        }
      });
    }

    // Update last_used_at timestamp (async, don't wait)
    pool.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [keyData.id]
    ).catch(err => {
      console.error('Error updating last_used_at:', err);
    });

    // Attach user and key info to request object
    req.user = {
      id: keyData.user_id,
      email: keyData.email,
      name: keyData.name,
      credits: keyData.credits
    };

    req.apiKey = {
      id: keyData.id,
      name: keyData.name,
      permissions: keyData.permissions,
      rate_limit: keyData.rate_limit
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Authentication failed due to server error'
      }
    });
  }
}

/**
 * Hash API key using SHA-256
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate a new API key
 */
function generateApiKey() {
  // Generate a random 32-byte key and encode as hex (64 characters)
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get key prefix (first 8 characters) for display purposes
 */
function getKeyPrefix(apiKey) {
  return apiKey.substring(0, 8);
}

/**
 * Create a new API key for a user
 */
async function createApiKey(userId, name = null, permissions = null, rateLimit = 100, expiresAt = null) {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  const result = await pool.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, permissions, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, key_prefix, name, created_at`,
    [userId, keyHash, keyPrefix, name, permissions, rateLimit, expiresAt]
  );

  return {
    apiKey, // Return the plain key only once
    ...result.rows[0]
  };
}

/**
 * Revoke (deactivate) an API key
 */
async function revokeApiKey(keyId, userId = null) {
  let query = 'UPDATE api_keys SET is_active = false WHERE id = $1';
  const params = [keyId];

  if (userId) {
    query += ' AND user_id = $2';
    params.push(userId);
  }

  query += ' RETURNING id';

  const result = await pool.query(query, params);
  return result.rows.length > 0;
}

/**
 * List API keys for a user
 */
async function listApiKeys(userId) {
  const result = await pool.query(
    `SELECT id, key_prefix, name, permissions, rate_limit, is_active, last_used_at, created_at, expires_at
     FROM api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  authenticateApiKey,
  hashApiKey,
  generateApiKey,
  getKeyPrefix,
  createApiKey,
  revokeApiKey,
  listApiKeys
};
