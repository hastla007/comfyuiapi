const crypto = require('crypto');

/**
 * Admin Authentication Middleware
 * Simple token-based authentication for admin endpoints
 */

// Require ADMIN_TOKEN to be set in environment
if (!process.env.ADMIN_TOKEN) {
  console.error('FATAL: ADMIN_TOKEN environment variable is not set.');
  console.error('Please set ADMIN_TOKEN in your .env file or environment variables.');
  console.error('You can generate a secure token using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/**
 * Middleware to check admin authentication
 * Expects Authorization header with format: Bearer <token>
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Missing Authorization header'
    });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer') {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Invalid authentication scheme. Use Bearer token.'
    });
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      details: 'Missing authentication token'
    });
  }

  // Constant-time comparison to prevent timing attacks
  let isValid = false;
  try {
    // timingSafeEqual requires buffers of equal length
    const tokenBuffer = Buffer.from(token);
    const adminTokenBuffer = Buffer.from(ADMIN_TOKEN);

    if (tokenBuffer.length === adminTokenBuffer.length) {
      isValid = crypto.timingSafeEqual(tokenBuffer, adminTokenBuffer);
    }
  } catch (error) {
    // Invalid token format, isValid remains false
    isValid = false;
  }

  if (!isValid) {
    return res.status(403).json({
      error: 'Access forbidden',
      details: 'Invalid authentication token'
    });
  }

  // Authentication successful
  next();
}

/**
 * Optional admin authentication
 * Adds req.isAdmin flag but doesn't block request
 */
function optionalAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.isAdmin = false;
    return next();
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const tokenBuffer = Buffer.from(token);
      const adminTokenBuffer = Buffer.from(ADMIN_TOKEN);

      if (tokenBuffer.length === adminTokenBuffer.length) {
        req.isAdmin = crypto.timingSafeEqual(tokenBuffer, adminTokenBuffer);
      } else {
        req.isAdmin = false;
      }
    } catch (error) {
      req.isAdmin = false;
    }
  } else {
    req.isAdmin = false;
  }

  next();
}

/**
 * API Key Authentication Middleware and Functions
 */
const { pool } = require('../database');

/**
 * Create a new API key for a user
 */
async function createApiKey(userId, name = null, permissions = null, rateLimit = 100, expiresAt = null) {
  // Generate a secure random API key
  const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.substring(0, 10);

  const result = await pool.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, permissions, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, key_prefix, name, created_at`,
    [userId, keyHash, keyPrefix, name, permissions, rateLimit, expiresAt]
  );

  return {
    apiKey, // Only returned once during creation
    ...result.rows[0]
  };
}

/**
 * Authenticate API key and attach user to request
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'missing_api_key',
        message: 'API key is required. Provide it in X-API-Key header or Authorization: Bearer header'
      }
    });
  }

  if (!apiKey.startsWith('sk_')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'invalid_api_key',
        message: 'Invalid API key format'
      }
    });
  }

  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const result = await pool.query(
      `SELECT ak.*, u.email, u.name, u.credits
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = $1 AND ak.revoked_at IS NULL`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'invalid_api_key',
          message: 'Invalid or revoked API key'
        }
      });
    }

    const keyData = result.rows[0];

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'expired_api_key',
          message: 'API key has expired'
        }
      });
    }

    // Update last used timestamp
    await pool.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [keyData.id]
    );

    // Attach user info to request
    req.user = {
      id: keyData.user_id,
      email: keyData.email,
      name: keyData.name,
      credits: keyData.credits
    };

    req.apiKey = {
      id: keyData.id,
      permissions: keyData.permissions,
      rate_limit: keyData.rate_limit
    };

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Authentication failed'
      }
    });
  }
}

/**
 * Revoke an API key
 */
async function revokeApiKey(keyId) {
  const result = await pool.query(
    'UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
    [keyId]
  );

  return result.rows.length > 0;
}

/**
 * List API keys for a user
 */
async function listApiKeys(userId) {
  const result = await pool.query(
    `SELECT id, key_prefix, name, permissions, rate_limit, created_at, last_used_at, expires_at, revoked_at
     FROM api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  requireAdmin,
  optionalAdmin,
  ADMIN_TOKEN,
  createApiKey,
  authenticateApiKey,
  revokeApiKey,
  listApiKeys
};
