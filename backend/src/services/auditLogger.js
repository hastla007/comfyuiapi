const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Audit Logger Service
 * Provides comprehensive audit logging for security and compliance
 */

/**
 * Action types for audit logging
 */
const ACTION_TYPES = {
  // Authentication
  LOGIN: 'user.login',
  LOGOUT: 'user.logout',
  LOGIN_FAILED: 'user.login_failed',
  PASSWORD_CHANGED: 'user.password_changed',

  // User management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // API Keys
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',

  // Jobs
  JOB_CREATED: 'job.created',
  JOB_CANCELLED: 'job.cancelled',
  JOB_FAILED: 'job.failed',

  // Workflows
  WORKFLOW_CREATED: 'workflow.created',
  WORKFLOW_UPDATED: 'workflow.updated',
  WORKFLOW_DELETED: 'workflow.deleted',

  // Organizations
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_DELETED: 'organization.deleted',
  MEMBER_ADDED: 'organization.member_added',
  MEMBER_REMOVED: 'organization.member_removed',

  // Security
  ACCESS_DENIED: 'security.access_denied',
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',

  // System
  SETTINGS_CHANGED: 'system.settings_changed',
  BACKUP_CREATED: 'system.backup_created'
};

/**
 * Log an audit event
 * @param {Object} event - Audit event details
 * @returns {Promise<Object>} Created audit log entry
 */
async function log(event) {
  const {
    userId = null,
    action,
    resourceType = null,
    resourceId = null,
    ipAddress = null,
    userAgent = null,
    requestId = null,
    metadata = {}
  } = event;

  if (!action) {
    throw new Error('Action is required for audit logging');
  }

  try {
    const result = await pool.query(`
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id,
        ip_address, user_agent, request_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId,
      action,
      resourceType,
      resourceId,
      ipAddress,
      userAgent,
      requestId,
      JSON.stringify(metadata)
    ]);

    logger.debug('Audit log created', {
      action,
      userId,
      resourceType,
      resourceId
    });

    return result.rows[0];
  } catch (error) {
    // Don't throw errors for audit logging failures
    // Log the error but continue execution
    logger.error('Failed to create audit log:', error);
    return null;
  }
}

/**
 * Express middleware to automatically log requests
 * @returns {Function} Express middleware
 */
function auditMiddleware() {
  return async (req, res, next) => {
    // Store original end function
    const originalEnd = res.end;

    // Override end function to log after response
    res.end = async function(chunk, encoding) {
      // Restore original end function
      res.end = originalEnd;

      // Call original end
      res.end(chunk, encoding);

      // Log audit event for certain actions
      if (shouldAudit(req, res)) {
        await log({
          userId: req.user?.id || null,
          action: determineAction(req, res),
          resourceType: determineResourceType(req),
          resourceId: determineResourceId(req),
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
          requestId: req.id,
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            query: req.query,
            body: sanitizeBody(req.body)
          }
        });
      }
    };

    next();
  };
}

/**
 * Determine if request should be audited
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {boolean} True if should audit
 */
function shouldAudit(req, res) {
  // Audit all non-GET requests
  if (req.method !== 'GET') {
    return true;
  }

  // Audit failed requests
  if (res.statusCode >= 400) {
    return true;
  }

  // Audit sensitive endpoints even for GET
  const sensitivePatterns = [
    /\/api\/admin\//,
    /\/api\/auth\//,
    /\/api\/api-keys/,
    /\/api\/users/
  ];

  return sensitivePatterns.some(pattern => pattern.test(req.path));
}

/**
 * Determine action from request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {string} Action type
 */
function determineAction(req, res) {
  const { method, path } = req;

  // Authentication endpoints
  if (path.includes('/auth/login')) {
    return res.statusCode === 200 ? ACTION_TYPES.LOGIN : ACTION_TYPES.LOGIN_FAILED;
  }
  if (path.includes('/auth/logout')) return ACTION_TYPES.LOGOUT;
  if (path.includes('/auth/change-password')) return ACTION_TYPES.PASSWORD_CHANGED;

  // Generic CRUD operations
  if (method === 'POST') return 'created';
  if (method === 'PUT' || method === 'PATCH') return 'updated';
  if (method === 'DELETE') return 'deleted';
  if (method === 'GET' && res.statusCode === 403) return ACTION_TYPES.ACCESS_DENIED;

  return `${method.toLowerCase()}.${path.split('/').filter(Boolean).join('.')}`;
}

/**
 * Determine resource type from request path
 * @param {Object} req - Express request
 * @returns {string|null} Resource type
 */
function determineResourceType(req) {
  const pathParts = req.path.split('/').filter(Boolean);

  if (pathParts.length >= 2) {
    // Remove 'api' prefix if present
    const resourceIndex = pathParts[0] === 'api' ? 1 : 0;
    return pathParts[resourceIndex];
  }

  return null;
}

/**
 * Determine resource ID from request
 * @param {Object} req - Express request
 * @returns {string|null} Resource ID
 */
function determineResourceId(req) {
  // Try to get ID from params
  if (req.params.id) return req.params.id;
  if (req.params.userId) return req.params.userId;
  if (req.params.jobId) return req.params.jobId;

  // Try to get ID from response body
  if (req.method === 'POST' && req.body?.id) return req.body.id;

  return null;
}

/**
 * Sanitize request body for logging
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'password_hash',
    'token',
    'api_key',
    'secret',
    'accessKeyId',
    'secretAccessKey'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Query audit logs
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Audit logs
 */
async function queryLogs(filters = {}) {
  const {
    userId,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = filters;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (userId) {
    query += ` AND user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  if (action) {
    query += ` AND action = $${paramIndex}`;
    params.push(action);
    paramIndex++;
  }

  if (resourceType) {
    query += ` AND resource_type = $${paramIndex}`;
    params.push(resourceType);
    paramIndex++;
  }

  if (resourceId) {
    query += ` AND resource_id = $${paramIndex}`;
    params.push(resourceId);
    paramIndex++;
  }

  if (startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
  const countParams = [];
  let countParamIndex = 1;

  if (userId) {
    countQuery += ` AND user_id = $${countParamIndex}`;
    countParams.push(userId);
    countParamIndex++;
  }

  if (action) {
    countQuery += ` AND action = $${countParamIndex}`;
    countParams.push(action);
    countParamIndex++;
  }

  if (resourceType) {
    countQuery += ` AND resource_type = $${countParamIndex}`;
    countParams.push(resourceType);
    countParamIndex++;
  }

  if (resourceId) {
    countQuery += ` AND resource_id = $${countParamIndex}`;
    countParams.push(resourceId);
    countParamIndex++;
  }

  if (startDate) {
    countQuery += ` AND created_at >= $${countParamIndex}`;
    countParams.push(startDate);
    countParamIndex++;
  }

  if (endDate) {
    countQuery += ` AND created_at <= $${countParamIndex}`;
    countParams.push(endDate);
  }

  const countResult = await pool.query(countQuery, countParams);

  return {
    logs: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Get audit statistics
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Audit statistics
 */
async function getStats(filters = {}) {
  const { userId, startDate, endDate } = filters;

  let query = `
    SELECT
      action,
      COUNT(*) as count,
      COUNT(DISTINCT user_id) as unique_users
    FROM audit_logs
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (userId) {
    query += ` AND user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  if (startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  query += ' GROUP BY action ORDER BY count DESC';

  const result = await pool.query(query, params);

  return {
    by_action: result.rows.map(row => ({
      action: row.action,
      count: parseInt(row.count),
      unique_users: parseInt(row.unique_users)
    }))
  };
}

/**
 * Log security event
 * @param {string} eventType - Event type
 * @param {string} severity - Severity level (low, medium, high, critical)
 * @param {Object} details - Event details
 */
async function logSecurityEvent(eventType, severity, details = {}) {
  const {
    userId = null,
    ipAddress = null,
    description = null,
    metadata = {}
  } = details;

  try {
    await pool.query(`
      INSERT INTO security_events (
        event_type, severity, user_id, ip_address, description, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      eventType,
      severity,
      userId,
      ipAddress,
      description,
      JSON.stringify(metadata)
    ]);

    logger.warn('Security event logged', {
      eventType,
      severity,
      userId,
      ipAddress
    });
  } catch (error) {
    logger.error('Failed to log security event:', error);
  }
}

/**
 * Get recent security events
 * @param {Object} filters - Query filters
 * @returns {Promise<Array>} Security events
 */
async function getSecurityEvents(filters = {}) {
  const { severity, limit = 100, offset = 0 } = filters;

  let query = 'SELECT * FROM security_events WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (severity) {
    query += ` AND severity = $${paramIndex}`;
    params.push(severity);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return result.rows;
}

module.exports = {
  ACTION_TYPES,
  log,
  auditMiddleware,
  queryLogs,
  getStats,
  logSecurityEvent,
  getSecurityEvents
};
