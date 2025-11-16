const logger = require('../utils/logger');
const { pool } = require('../database');
const auditLogger = require('../services/auditLogger');

/**
 * IP Whitelisting Middleware
 * Restricts API access to whitelisted IP addresses
 */

/**
 * Check if IP is in whitelist
 * @param {string} ipAddress - IP address to check
 * @param {Array} whitelist - Array of allowed IPs
 * @returns {boolean} True if IP is allowed
 */
function isIPAllowed(ipAddress, whitelist) {
  if (!whitelist || whitelist.length === 0) {
    // No whitelist configured - allow all
    return true;
  }

  // Normalize IP address (remove IPv6 prefix if present)
  const normalizedIP = ipAddress.replace(/^::ffff:/, '');

  // Check for exact match
  if (whitelist.includes(normalizedIP)) {
    return true;
  }

  // Check for CIDR ranges
  for (const entry of whitelist) {
    if (entry.includes('/')) {
      if (isIPInCIDR(normalizedIP, entry)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if IP is in CIDR range
 * @param {string} ip - IP address
 * @param {string} cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns {boolean} True if IP is in range
 */
function isIPInCIDR(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = -1 << (32 - parseInt(bits));

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Convert IP address to number
 * @param {string} ip - IP address
 * @returns {number} IP as number
 */
function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => {
    return (acc << 8) + parseInt(octet);
  }, 0) >>> 0;
}

/**
 * IP whitelist middleware for API keys
 * Checks if API key has IP restrictions and validates them
 * @returns {Function} Express middleware
 */
function requireIPWhitelist() {
  return async (req, res, next) => {
    // Only check if user is authenticated via API key
    if (!req.apiKey || !req.user) {
      return next();
    }

    try {
      // Get API key with allowed IPs
      const result = await pool.query(
        'SELECT allowed_ips FROM api_keys WHERE id = $1',
        [req.apiKey.id]
      );

      if (result.rows.length === 0) {
        return next();
      }

      const allowedIPs = result.rows[0].allowed_ips;

      // If no IP restrictions, allow access
      if (!allowedIPs || allowedIPs.length === 0) {
        return next();
      }

      // Get client IP
      const clientIP = req.ip || req.connection.remoteAddress;

      // Check if IP is allowed
      if (!isIPAllowed(clientIP, allowedIPs)) {
        logger.warn('IP not in whitelist', {
          userId: req.user.id,
          apiKeyId: req.apiKey.id,
          clientIP,
          allowedIPs
        });

        // Log security event
        await auditLogger.logSecurityEvent(
          'ip_whitelist_violation',
          'medium',
          {
            userId: req.user.id,
            ipAddress: clientIP,
            description: 'IP address not in API key whitelist',
            metadata: {
              apiKeyId: req.apiKey.id,
              allowedIPs
            }
          }
        );

        return res.status(403).json({
          success: false,
          error: {
            code: 'ip_not_allowed',
            message: 'Your IP address is not authorized to use this API key'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking IP whitelist:', error);
      // On error, deny access to be safe
      return res.status(500).json({
        success: false,
        error: {
          code: 'whitelist_check_failed',
          message: 'Failed to verify IP whitelist'
        }
      });
    }
  };
}

/**
 * Global IP whitelist middleware
 * Restricts all API access to globally whitelisted IPs
 * Configure via environment variable: GLOBAL_IP_WHITELIST
 * @returns {Function} Express middleware
 */
function globalIPWhitelist() {
  // Get whitelist from environment
  const whitelist = process.env.GLOBAL_IP_WHITELIST
    ? process.env.GLOBAL_IP_WHITELIST.split(',').map(ip => ip.trim())
    : null;

  return (req, res, next) => {
    // If no global whitelist configured, allow all
    if (!whitelist || whitelist.length === 0) {
      return next();
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (!isIPAllowed(clientIP, whitelist)) {
      logger.warn('IP blocked by global whitelist', {
        clientIP,
        path: req.path
      });

      // Log security event
      auditLogger.logSecurityEvent(
        'global_ip_whitelist_violation',
        'high',
        {
          ipAddress: clientIP,
          description: 'IP address not in global whitelist',
          metadata: {
            path: req.path,
            method: req.method
          }
        }
      );

      return res.status(403).json({
        success: false,
        error: {
          code: 'ip_blocked',
          message: 'Access denied from your IP address'
        }
      });
    }

    next();
  };
}

/**
 * Add IP to API key whitelist
 * @param {number} apiKeyId - API key ID
 * @param {string} ipAddress - IP address to add
 */
async function addIPToWhitelist(apiKeyId, ipAddress) {
  await pool.query(`
    UPDATE api_keys
    SET allowed_ips = array_append(COALESCE(allowed_ips, ARRAY[]::text[]), $1)
    WHERE id = $2
      AND NOT ($1 = ANY(COALESCE(allowed_ips, ARRAY[]::text[])))
  `, [ipAddress, apiKeyId]);

  logger.info('IP added to whitelist', { apiKeyId, ipAddress });
}

/**
 * Remove IP from API key whitelist
 * @param {number} apiKeyId - API key ID
 * @param {string} ipAddress - IP address to remove
 */
async function removeIPFromWhitelist(apiKeyId, ipAddress) {
  await pool.query(`
    UPDATE api_keys
    SET allowed_ips = array_remove(allowed_ips, $1)
    WHERE id = $2
  `, [ipAddress, apiKeyId]);

  logger.info('IP removed from whitelist', { apiKeyId, ipAddress });
}

/**
 * Get API key whitelist
 * @param {number} apiKeyId - API key ID
 * @returns {Promise<Array>} Array of allowed IPs
 */
async function getWhitelist(apiKeyId) {
  const result = await pool.query(
    'SELECT allowed_ips FROM api_keys WHERE id = $1',
    [apiKeyId]
  );

  if (result.rows.length === 0) {
    throw new Error('API key not found');
  }

  return result.rows[0].allowed_ips || [];
}

/**
 * Set API key whitelist
 * @param {number} apiKeyId - API key ID
 * @param {Array} ipAddresses - Array of allowed IPs
 */
async function setWhitelist(apiKeyId, ipAddresses) {
  await pool.query(
    'UPDATE api_keys SET allowed_ips = $1 WHERE id = $2',
    [ipAddresses, apiKeyId]
  );

  logger.info('Whitelist updated', { apiKeyId, count: ipAddresses.length });
}

/**
 * Clear API key whitelist
 * @param {number} apiKeyId - API key ID
 */
async function clearWhitelist(apiKeyId) {
  await pool.query(
    'UPDATE api_keys SET allowed_ips = NULL WHERE id = $1',
    [apiKeyId]
  );

  logger.info('Whitelist cleared', { apiKeyId });
}

/**
 * Validate IP address format
 * @param {string} ip - IP address
 * @returns {boolean} True if valid
 */
function validateIPAddress(ip) {
  // IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part);
      return num >= 0 && num <= 255;
    });
  }

  // CIDR validation
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (cidrRegex.test(ip)) {
    const [address, bits] = ip.split('/');
    const bitsNum = parseInt(bits);
    return validateIPAddress(address) && bitsNum >= 0 && bitsNum <= 32;
  }

  return false;
}

module.exports = {
  requireIPWhitelist,
  globalIPWhitelist,
  isIPAllowed,
  addIPToWhitelist,
  removeIPFromWhitelist,
  getWhitelist,
  setWhitelist,
  clearWhitelist,
  validateIPAddress
};
