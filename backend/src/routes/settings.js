const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateApiKey, requireAdmin } = require('../middleware/auth');
const { isValidUrl } = require('../utils/validation');

// In-memory settings store (in production, use database)
let settings = {
  maxConcurrentJobs: 5,
  jobTimeout: 3600,
  enableWebhooks: false,
  webhookUrl: '',
  logLevel: 'info',
  autoCleanupDays: 7,
  enableMetrics: true
};

// Get all settings
router.get('/', authenticateApiKey, (req, res) => {
  try {
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update settings
router.put('/', requireAdmin, (req, res) => {
  try {
    const updates = req.body;

    // Whitelist of allowed settings keys to prevent prototype pollution
    const allowedKeys = [
      'maxConcurrentJobs',
      'jobTimeout',
      'enableWebhooks',
      'webhookUrl',
      'logLevel',
      'autoCleanupDays',
      'enableMetrics'
    ];

    // Check for any disallowed keys
    const invalidKeys = Object.keys(updates).filter(key => !allowedKeys.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid settings keys: ${invalidKeys.join(', ')}`,
        allowed_keys: allowedKeys
      });
    }

    // Validate and update settings with proper type checking and bounds
    if (updates.maxConcurrentJobs !== undefined) {
      const value = parseInt(updates.maxConcurrentJobs, 10);
      if (isNaN(value)) {
        return res.status(400).json({ success: false, error: 'maxConcurrentJobs must be a number' });
      }
      settings.maxConcurrentJobs = Math.max(1, Math.min(20, value));
    }
    if (updates.jobTimeout !== undefined) {
      const value = parseInt(updates.jobTimeout, 10);
      if (isNaN(value)) {
        return res.status(400).json({ success: false, error: 'jobTimeout must be a number' });
      }
      settings.jobTimeout = Math.max(60, Math.min(86400, value));
    }
    if (updates.enableWebhooks !== undefined) {
      settings.enableWebhooks = Boolean(updates.enableWebhooks);
    }
    if (updates.webhookUrl !== undefined) {
      // Validate URL format to prevent SSRF
      const url = String(updates.webhookUrl);
      if (url && !isValidUrl(url)) {
        return res.status(400).json({ success: false, error: 'Invalid webhook URL format' });
      }
      settings.webhookUrl = url;
    }
    if (updates.logLevel !== undefined) {
      const allowedLevels = ['error', 'warn', 'info', 'debug'];
      const level = String(updates.logLevel);
      if (!allowedLevels.includes(level)) {
        return res.status(400).json({
          success: false,
          error: `Invalid log level. Must be one of: ${allowedLevels.join(', ')}`
        });
      }
      settings.logLevel = level;
      // Update logger level if possible
      if (logger.level) {
        logger.level = settings.logLevel;
      }
    }
    if (updates.autoCleanupDays !== undefined) {
      const value = parseInt(updates.autoCleanupDays, 10);
      if (isNaN(value)) {
        return res.status(400).json({ success: false, error: 'autoCleanupDays must be a number' });
      }
      settings.autoCleanupDays = Math.max(1, Math.min(365, value));
    }
    if (updates.enableMetrics !== undefined) {
      settings.enableMetrics = Boolean(updates.enableMetrics);
    }

    logger.info('Settings updated:', settings);

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

// Get specific setting
router.get('/:key', authenticateApiKey, (req, res) => {
  try {
    const { key } = req.params;

    // Use Object.prototype.hasOwnProperty.call to avoid prototype pollution
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      res.json({
        success: true,
        key,
        value: settings[key]
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }
  } catch (error) {
    logger.error('Error fetching setting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
module.exports.settings = settings;
