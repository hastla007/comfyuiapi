const logger = require('../utils/logger');
const { pool } = require('../database');

/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * This middleware provides fine-grained access control based on user roles
 * and organization membership.
 */

/**
 * Role hierarchy (higher number = more permissions)
 */
const ROLE_HIERARCHY = {
  'user': 1,
  'premium': 2,
  'admin': 3,
  'super_admin': 4
};

/**
 * Check if user has required role
 * @param {string|Array<string>} requiredRoles - Single role or array of roles
 * @returns {Function} Express middleware
 */
function requireRole(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    const userRole = req.user.role || 'user';
    const hasRole = roles.some(role => userRole === role);

    if (!hasRole) {
      logger.warn('Access denied - insufficient role', {
        userId: req.user.id,
        userRole,
        requiredRoles: roles
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'forbidden',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
}

/**
 * Check if user has minimum role level
 * @param {string} minimumRole - Minimum required role
 * @returns {Function} Express middleware
 */
function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    const userRole = req.user.role || 'user';
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] || 0;

    if (userLevel < requiredLevel) {
      logger.warn('Access denied - insufficient role level', {
        userId: req.user.id,
        userRole,
        requiredRole: minimumRole
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'forbidden',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
}

/**
 * Check if user is a member of the specified organization
 * Organization ID can be in req.params.organizationId or req.body.organization_id
 * @returns {Function} Express middleware
 */
function requireOrganizationMembership() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    const organizationId = req.params.organizationId || req.body.organization_id || req.query.organization_id;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_organization',
          message: 'Organization ID is required'
        }
      });
    }

    try {
      const result = await pool.query(
        `SELECT om.role, o.name
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.organization_id = $1 AND om.user_id = $2`,
        [organizationId, req.user.id]
      );

      if (result.rows.length === 0) {
        logger.warn('Access denied - not organization member', {
          userId: req.user.id,
          organizationId
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'not_member',
            message: 'You are not a member of this organization'
          }
        });
      }

      // Attach organization membership info to request
      req.organizationMembership = {
        organizationId: parseInt(organizationId),
        role: result.rows[0].role,
        organizationName: result.rows[0].name
      };

      next();
    } catch (error) {
      logger.error('Error checking organization membership:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'internal_error',
          message: 'Failed to verify organization membership'
        }
      });
    }
  };
}

/**
 * Check if user has specific role within organization
 * @param {string|Array<string>} requiredRoles - Required organization roles (owner, admin, member)
 * @returns {Function} Express middleware
 */
function requireOrganizationRole(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    const organizationId = req.params.organizationId || req.body.organization_id || req.query.organization_id;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_organization',
          message: 'Organization ID is required'
        }
      });
    }

    try {
      const result = await pool.query(
        `SELECT om.role, o.owner_user_id
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.organization_id = $1 AND om.user_id = $2`,
        [organizationId, req.user.id]
      );

      if (result.rows.length === 0) {
        logger.warn('Access denied - not organization member', {
          userId: req.user.id,
          organizationId
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'not_member',
            message: 'You are not a member of this organization'
          }
        });
      }

      const membership = result.rows[0];
      let userRole = membership.role;

      // Check if user is owner (owners have implicit admin role)
      if (membership.owner_user_id === req.user.id) {
        userRole = 'owner';
      }

      const hasRole = roles.some(role => userRole === role);

      if (!hasRole) {
        logger.warn('Access denied - insufficient organization role', {
          userId: req.user.id,
          organizationId,
          userRole,
          requiredRoles: roles
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'insufficient_permissions',
            message: 'You do not have the required role in this organization'
          }
        });
      }

      // Attach organization membership info to request
      req.organizationMembership = {
        organizationId: parseInt(organizationId),
        role: userRole
      };

      next();
    } catch (error) {
      logger.error('Error checking organization role:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'internal_error',
          message: 'Failed to verify organization role'
        }
      });
    }
  };
}

/**
 * Check if user owns the resource or is admin
 * Resource owner ID is determined by the resourceOwnerField parameter
 * @param {string} resourceOwnerField - Field name containing owner user ID (e.g., 'user_id')
 * @param {string} resourceType - Type of resource for logging (e.g., 'job', 'workflow')
 * @returns {Function} Express middleware
 */
function requireOwnership(resourceOwnerField = 'user_id', resourceType = 'resource') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    // Admins and super_admins can access any resource
    const userRole = req.user.role || 'user';
    if (['admin', 'super_admin'].includes(userRole)) {
      return next();
    }

    const resourceOwnerId = req.body[resourceOwnerField] || req[resourceType]?.[resourceOwnerField];

    if (!resourceOwnerId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: `${resourceType} owner information not found`
        }
      });
    }

    if (resourceOwnerId !== req.user.id) {
      logger.warn('Access denied - not resource owner', {
        userId: req.user.id,
        resourceOwnerId,
        resourceType
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'forbidden',
          message: `You do not have permission to access this ${resourceType}`
        }
      });
    }

    next();
  };
}

/**
 * Check permission based on custom logic
 * @param {Function} permissionChecker - Async function that returns true/false
 * @returns {Function} Express middleware
 */
function requirePermission(permissionChecker) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required'
        }
      });
    }

    try {
      const hasPermission = await permissionChecker(req);

      if (!hasPermission) {
        logger.warn('Access denied - custom permission check failed', {
          userId: req.user.id,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'forbidden',
            message: 'You do not have permission to perform this action'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking permission:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'internal_error',
          message: 'Failed to verify permissions'
        }
      });
    }
  };
}

/**
 * Rate limiting per role
 * Premium users get higher rate limits
 * @returns {Function} Express middleware
 */
function roleBasedRateLimit() {
  const limits = {
    'user': 100,        // 100 requests per window
    'premium': 500,     // 500 requests per window
    'admin': 1000,      // 1000 requests per window
    'super_admin': -1   // Unlimited
  };

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userRole = req.user.role || 'user';
    const limit = limits[userRole] || limits['user'];

    // Attach rate limit info to request for potential rate limiter middleware
    req.rateLimit = {
      max: limit,
      role: userRole
    };

    next();
  };
}

module.exports = {
  requireRole,
  requireMinimumRole,
  requireOrganizationMembership,
  requireOrganizationRole,
  requireOwnership,
  requirePermission,
  roleBasedRateLimit,
  ROLE_HIERARCHY
};
