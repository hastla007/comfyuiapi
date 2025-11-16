const express = require('express');
const router = express.Router();
const {
  createJob,
  getJob,
  getJobResult,
  updateJobStatus,
  cancelJob,
  listJobs
} = require('../services/jobService');
const { authenticateApiKey } = require('../middleware/auth');

// Apply authentication middleware to all job routes
router.use(authenticateApiKey);

/**
 * GET /api/v1/jobs - List jobs
 */
router.get('/', async (req, res) => {
  try {
    const { status, model, limit, offset } = req.query;

    const options = {
      status,
      model,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    };

    const result = await listJobs(req.user.id, options);
    res.json(result);
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to list jobs'
      }
    });
  }
});

/**
 * GET /api/v1/jobs/:jobId - Get job status
 */
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid job ID format'
        }
      });
    }

    const job = await getJob(jobId, req.user.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'job_not_found',
          message: 'Job not found'
        }
      });
    }

    res.json(job);
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to get job'
      }
    });
  }
});

/**
 * GET /api/v1/jobs/:jobId/result - Get job result
 */
router.get('/:jobId/result', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid job ID format'
        }
      });
    }

    const result = await getJobResult(jobId, req.user.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'job_not_found',
          message: 'Job not found'
        }
      });
    }

    // If result has an error property, it means job is not completed
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting job result:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to get job result'
      }
    });
  }
});

/**
 * DELETE /api/v1/jobs/:jobId - Cancel job
 */
router.delete('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid job ID format'
        }
      });
    }

    const cancelled = await cancelJob(jobId, req.user.id);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'job_not_found',
          message: 'Job not found or already completed'
        }
      });
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to cancel job'
      }
    });
  }
});

module.exports = router;
