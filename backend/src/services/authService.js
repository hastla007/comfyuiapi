const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../database');
const logger = require('../utils/logger');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} name - User display name
 * @returns {Promise<Object>} User object with tokens
 */
async function registerUser(email, password, name) {
  const client = await pool.connect();

  try {
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      const error = new Error('User already exists');
      error.code = 'USER_EXISTS';
      throw error;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await client.query(`
      INSERT INTO users (email, password_hash, name, role, is_active, credits)
      VALUES ($1, $2, $3, 'user', true, 0)
      RETURNING id, email, name, role, is_active, credits, created_at
    `, [email.toLowerCase(), passwordHash, name]);

    const user = result.rows[0];

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    await client.query(
      'UPDATE users SET refresh_token = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2',
      [refreshToken, user.id]
    );

    logger.info('User registered successfully', { userId: user.id, email: user.email });

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken
    };
  } finally {
    client.release();
  }
}

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User object with tokens
 */
async function loginUser(email, password) {
  const client = await pool.connect();

  try {
    // Get user by email
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      const error = new Error('Invalid credentials');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.is_active) {
      const error = new Error('Account is inactive');
      error.code = 'ACCOUNT_INACTIVE';
      throw error;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Invalid credentials');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token and update last login
    await client.query(
      'UPDATE users SET refresh_token = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2',
      [refreshToken, user.id]
    );

    logger.info('User logged in successfully', { userId: user.id, email: user.email });

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken
    };
  } finally {
    client.release();
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New access and refresh tokens
 */
async function refreshAccessToken(refreshToken) {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    // Get user and verify refresh token matches
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND is_active = true',
      [decoded.userId, refreshToken]
    );

    if (result.rows.length === 0) {
      const error = new Error('Invalid refresh token');
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    const user = result.rows[0];

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update refresh token
    await pool.query(
      'UPDATE users SET refresh_token = $1 WHERE id = $2',
      [newRefreshToken, user.id]
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      const err = new Error('Invalid or expired token');
      err.code = 'INVALID_TOKEN';
      throw err;
    }
    throw error;
  }
}

/**
 * Logout user by invalidating refresh token
 * @param {number} userId - User ID
 */
async function logoutUser(userId) {
  await pool.query(
    'UPDATE users SET refresh_token = NULL WHERE id = $1',
    [userId]
  );

  logger.info('User logged out', { userId });
}

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User object
 */
async function getUserById(userId) {
  const result = await pool.query(
    'SELECT id, email, name, role, is_active, email_verified, avatar_url, credits, storage_quota_bytes, storage_used_bytes, created_at, last_login FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0];
}

/**
 * Update user profile
 * @param {number} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user object
 */
async function updateUser(userId, updateData) {
  const allowedFields = ['name', 'avatar_url'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    throw new Error('No valid fields to update');
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(userId);

  const query = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, email, name, role, is_active, email_verified, avatar_url, credits, created_at
  `;

  const result = await pool.query(query, values);

  logger.info('User profile updated', { userId });

  return result.rows[0];
}

/**
 * Change user password
 * @param {number} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 */
async function changePassword(userId, currentPassword, newPassword) {
  const client = await pool.connect();

  try {
    // Get current user
    const result = await client.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Invalid current password');
      error.code = 'INVALID_PASSWORD';
      throw error;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password and invalidate refresh token
    await client.query(
      'UPDATE users SET password_hash = $1, refresh_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    logger.info('User password changed', { userId });
  } finally {
    client.release();
  }
}

/**
 * Request password reset
 * @param {string} email - User email
 */
async function requestPasswordReset(email) {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );

  if (result.rows.length > 0) {
    // In production, generate a reset token and send email
    // For now, just log it
    const resetToken = crypto.randomBytes(32).toString('hex');
    logger.info('Password reset requested', { email, resetToken });

    // Store reset token in database with expiration (would need migration to add reset_token field)
    // await pool.query(
    //   'UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL \'1 hour\' WHERE id = $2',
    //   [resetToken, result.rows[0].id]
    // );
  }
}

/**
 * Verify email address
 * @param {string} token - Verification token
 */
async function verifyEmail(token) {
  // In production, verify the token and mark email as verified
  // For now, just a placeholder
  const error = new Error('Email verification not implemented');
  error.code = 'NOT_IMPLEMENTED';
  throw error;
}

/**
 * Generate JWT access token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate JWT refresh token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

/**
 * Remove sensitive fields from user object
 * @param {Object} user - User object
 * @returns {Object} Sanitized user object
 */
function sanitizeUser(user) {
  const { password_hash, refresh_token, ...sanitized } = user;
  return sanitized;
}

/**
 * Verify JWT token and return user data
 * @param {string} token - JWT token
 * @returns {Promise<Object>} User data from token
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    const err = new Error('Invalid token');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getUserById,
  updateUser,
  changePassword,
  requestPasswordReset,
  verifyEmail,
  verifyToken,
  generateAccessToken,
  generateRefreshToken
};
