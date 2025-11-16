const crypto = require('crypto');

/**
 * Admin Authentication Middleware
 * Simple token-based authentication for admin endpoints
 */

// Generate a secure admin token if not set
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (() => {
  const token = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: No ADMIN_TOKEN set in environment. Generated temporary token:', token);
  console.warn('Set ADMIN_TOKEN in .env for production use.');
  return token;
})();

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
  const isValid = crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(ADMIN_TOKEN)
  );

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
      const isValid = crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(ADMIN_TOKEN)
      );
      req.isAdmin = isValid;
    } catch (error) {
      req.isAdmin = false;
    }
  } else {
    req.isAdmin = false;
  }

  next();
}

module.exports = { requireAdmin, optionalAdmin, ADMIN_TOKEN };
