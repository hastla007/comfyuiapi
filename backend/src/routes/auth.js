const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Registration Schema
 */
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(255).required()
});

/**
 * Login Schema
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const { email, password, name } = value;

    // Register user
    const result = await authService.registerUser(email, password, name);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);

    if (error.code === 'USER_EXISTS') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'user_exists',
          message: 'User with this email already exists'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'registration_failed',
        message: 'Registration failed. Please try again.'
      }
    });
  }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const { email, password } = value;

    // Authenticate user
    const result = await authService.loginUser(email, password);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    logger.error('Login error:', error);

    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'invalid_credentials',
          message: 'Invalid email or password'
        }
      });
    }

    if (error.code === 'ACCOUNT_INACTIVE') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'account_inactive',
          message: 'Your account has been deactivated'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'login_failed',
        message: 'Login failed. Please try again.'
      }
    });
  }
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_refresh_token',
          message: 'Refresh token is required'
        }
      });
    }

    const result = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);

    if (error.code === 'INVALID_TOKEN') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired refresh token'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'refresh_failed',
        message: 'Token refresh failed. Please try again.'
      }
    });
  }
});

/**
 * Logout user (invalidate refresh token)
 * POST /api/auth/logout
 */
router.post('/logout', authenticateApiKey, async (req, res) => {
  try {
    await authService.logoutUser(req.user.id);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'logout_failed',
        message: 'Logout failed. Please try again.'
      }
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', authenticateApiKey, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_profile_failed',
        message: 'Failed to get user profile'
      }
    });
  }
});

/**
 * Update user profile
 * PATCH /api/auth/me
 */
router.patch('/me', authenticateApiKey, async (req, res) => {
  try {
    const { name, avatar_url } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (avatar_url) updateData.avatar_url = avatar_url;

    const user = await authService.updateUser(req.user.id, updateData);

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update user profile'
      }
    });
  }
});

/**
 * Change password
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticateApiKey, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_fields',
          message: 'Current password and new password are required'
        }
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'weak_password',
          message: 'New password must be at least 8 characters long'
        }
      });
    }

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);

    if (error.code === 'INVALID_PASSWORD') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'invalid_password',
          message: 'Current password is incorrect'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'change_password_failed',
        message: 'Failed to change password'
      }
    });
  }
});

/**
 * Request password reset (generates reset token)
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_email',
          message: 'Email is required'
        }
      });
    }

    await authService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  } catch (error) {
    logger.error('Password reset request error:', error);

    // Still return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  }
});

/**
 * Verify email address
 * POST /api/auth/verify-email
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_token',
          message: 'Verification token is required'
        }
      });
    }

    await authService.verifyEmail(token);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    logger.error('Email verification error:', error);

    if (error.code === 'INVALID_TOKEN') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired verification token'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'verification_failed',
        message: 'Email verification failed'
      }
    });
  }
});

module.exports = router;
