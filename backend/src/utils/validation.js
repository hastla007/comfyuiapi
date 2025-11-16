/**
 * Validation utilities
 */

/**
 * Validate base64 string size
 * @param {string} base64String - The base64 string to validate
 * @param {number} maxSizeMB - Maximum size in megabytes
 * @returns {object} - { valid: boolean, error: string|null, sizeMB: number }
 */
function validateBase64Size(base64String, maxSizeMB = 20) {
  if (!base64String || typeof base64String !== 'string') {
    return { valid: true, error: null, sizeMB: 0 }; // Empty is valid
  }

  // Remove data URI prefix if present (e.g., "data:image/png;base64,")
  const base64Data = base64String.replace(/^data:[^;]+;base64,/, '');

  // Calculate size: base64 encoding increases size by ~33%
  // Actual size = (base64 length * 3) / 4
  const sizeBytes = (base64Data.length * 3) / 4;
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Base64 data too large (${sizeMB.toFixed(2)}MB). Maximum allowed: ${maxSizeMB}MB`,
      sizeMB
    };
  }

  return { valid: true, error: null, sizeMB };
}

/**
 * Validate multiple base64 fields in a request body
 * @param {object} body - Request body
 * @param {array} fields - Array of field names to validate
 * @param {number} maxSizeMB - Maximum size per field in megabytes
 * @returns {object} - { valid: boolean, errors: array }
 */
function validateBase64Fields(body, fields, maxSizeMB = 20) {
  const errors = [];

  for (const field of fields) {
    if (body[field]) {
      const validation = validateBase64Size(body[field], maxSizeMB);
      if (!validation.valid) {
        errors.push(`${field}: ${validation.error}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate URL format and prevent SSRF attacks
 * @param {string} urlString - The URL to validate
 * @returns {boolean} - true if valid and safe, false otherwise
 */
function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Prevent access to private IP ranges and localhost
    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback addresses
    const privateRanges = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254', // AWS metadata service
      'metadata.google.internal', // GCP metadata
      'fd00:ec2::254' // AWS IPv6 metadata
    ];

    if (privateRanges.includes(hostname)) {
      return false;
    }

    // Check for IPv6 localhost separately
    if (hostname === '[::1]' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    if (hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
      return false;
    }

    // Block link-local addresses (169.254.0.0/16)
    if (hostname.startsWith('169.254.')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate multiple URL fields in a request body
 * @param {object} body - Request body
 * @param {array} fields - Array of field names to validate
 * @returns {object} - { valid: boolean, errors: array }
 */
function validateUrlFields(body, fields) {
  const errors = [];

  for (const field of fields) {
    if (body[field] && !isValidUrl(body[field])) {
      errors.push(`${field}: Invalid or unsafe URL`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateBase64Size,
  validateBase64Fields,
  isValidUrl,
  validateUrlFields
};
