const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

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
router.get('/', (req, res) => {
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
router.put('/', (req, res) => {
  try {
    const updates = req.body;

    // Validate and update settings
    if (updates.maxConcurrentJobs !== undefined) {
      settings.maxConcurrentJobs = Math.max(1, Math.min(20, parseInt(updates.maxConcurrentJobs)));
    }
    if (updates.jobTimeout !== undefined) {
      settings.jobTimeout = Math.max(60, Math.min(86400, parseInt(updates.jobTimeout)));
    }
    if (updates.enableWebhooks !== undefined) {
      settings.enableWebhooks = Boolean(updates.enableWebhooks);
    }
    if (updates.webhookUrl !== undefined) {
      settings.webhookUrl = String(updates.webhookUrl);
    }
    if (updates.logLevel !== undefined) {
      settings.logLevel = String(updates.logLevel);
      // Update logger level if possible
      if (logger.level) {
        logger.level = settings.logLevel;
      }
    }
    if (updates.autoCleanupDays !== undefined) {
      settings.autoCleanupDays = Math.max(1, Math.min(365, parseInt(updates.autoCleanupDays)));
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
      error: error.message
    });
  }
});

// Get specific setting
router.get('/:key', (req, res) => {
  try {
    const { key } = req.params;

    if (settings.hasOwnProperty(key)) {
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
