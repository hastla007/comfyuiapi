const express = require('express');
const router = express.Router();
const path = require('path');
const mediaStorage = require('../services/mediaStorage');
const logger = require('../utils/logger');

/**
 * Serve a media file
 * GET /api/media/:filename
 */
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent path traversal attacks
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      logger.warn(`Path traversal attempt detected: ${filename}`);
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Only allow alphanumeric characters, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }

    // Get the image
    const buffer = await mediaStorage.getImage(filename);

    // Determine content type from extension
    const ext = filename.split('.').pop().toLowerCase();
    const contentTypeMap = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'gif': 'image/gif'
    };

    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Set cache headers
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000', // 1 year
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (error) {
    logger.error(`Error serving media file ${req.params.filename}:`, error);
    res.status(404).json({ error: 'Media not found' });
  }
});

/**
 * Get storage stats
 * GET /api/media/stats/storage
 */
router.get('/stats/storage', async (req, res) => {
  try {
    const stats = await mediaStorage.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
});

module.exports = router;
