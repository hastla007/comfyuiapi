const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const websocketService = require('../services/websocketService');
const logger = require('../utils/logger');
const { getContainer } = require('../docker');

/**
 * @swagger
 * /api/logs/stream/{containerId}:
 *   get:
 *     summary: Stream logs from a container
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: containerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Log stream started
 */
router.get('/stream/:containerId', authenticate, async (req, res) => {
  try {
    const { containerId } = req.params;
    const { tail = 100 } = req.query;

    const container = getContainer(containerId);
    const logStream = await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail: parseInt(tail)
    });

    const logs = logStream.toString('utf-8').split('\n').filter(Boolean);

    res.json({
      success: true,
      data: {
        containerId,
        logs: logs.map((line, index) => ({
          line: index + 1,
          message: line.substring(8), // Remove Docker log prefix
          timestamp: new Date().toISOString()
        }))
      }
    });
  } catch (error) {
    logger.error('Error streaming logs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'log_stream_error',
        message: error.message
      }
    });
  }
});

/**
 * @swagger
 * /api/logs/live/{source}:
 *   post:
 *     summary: Push live log entry
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 */
router.post('/live/:source', authenticate, async (req, res) => {
  try {
    const { source } = req.params;
    const logEntry = req.body;

    websocketService.streamLog(source, logEntry);

    res.json({
      success: true,
      message: 'Log entry streamed'
    });
  } catch (error) {
    logger.error('Error pushing log entry:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'log_push_error',
        message: error.message
      }
    });
  }
});

module.exports = router;
