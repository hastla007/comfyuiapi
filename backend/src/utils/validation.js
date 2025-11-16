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

module.exports = {
  validateBase64Size,
  validateBase64Fields
};
