const express = require('express');
const router = express.Router();
const { createJob } = require('../services/jobService');
const { authenticateApiKey } = require('../middleware/auth');
const { validateBase64Fields } = require('../utils/validation');
const logger = require('../utils/logger');

// Apply authentication middleware to all Infinitetalk routes
router.use(authenticateApiKey);

/**
 * Validate common Infinitetalk parameters
 */
function validateInfinitetalkParams(body) {
  const errors = [];

  // Resolution validation
  const validResolutions = ['480p', '720p'];
  if (body.resolution && !validResolutions.includes(body.resolution)) {
    errors.push(`Invalid resolution. Must be one of: ${validResolutions.join(', ')}`);
  }

  // Seed validation
  if (body.seed !== undefined && body.seed !== -1) {
    const seed = parseInt(body.seed, 10);
    if (isNaN(seed) || seed < 0) {
      errors.push('Invalid seed. Must be -1 (random) or a positive integer');
    }
  }

  // Workflow ID validation
  if (body.workflow_id !== undefined) {
    const workflowId = parseInt(body.workflow_id, 10);
    if (isNaN(workflowId) || workflowId < 1) {
      errors.push('Invalid workflow_id. Must be a positive integer');
    }
  }

  return errors;
}

/**
 * POST /api/v1/infinitetalk - Standard Infinitetalk
 */
router.post('/', async (req, res) => {
  try {
    const { image_url, image_base64, audio_url, audio_base64, resolution, seed, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 20MB for images, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation
    if (!image_url && !image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either image_url or image_base64 is required'
        }
      });
    }

    if (image_url && image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either image_url or image_base64, not both'
        }
      });
    }

    if (!audio_url && !audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url or audio_base64 is required'
        }
      });
    }

    if (audio_url && audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url or audio_base64, not both'
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      image_url: image_url || null,
      image_base64: image_base64 || null,
      audio_url: audio_url || null,
      audio_base64: audio_base64 || null,
      resolution: resolution || '720p',
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

/**
 * POST /api/v1/infinitetalk/fast - Infinitetalk Fast
 */
router.post('/fast', async (req, res) => {
  try {
    const { image_url, image_base64, audio_url, audio_base64, resolution, seed, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 20MB for images, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation (same as standard Infinitetalk)
    if (!image_url && !image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either image_url or image_base64 is required'
        }
      });
    }

    if (image_url && image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either image_url or image_base64, not both'
        }
      });
    }

    if (!audio_url && !audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url or audio_base64 is required'
        }
      });
    }

    if (audio_url && audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url or audio_base64, not both'
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      image_url: image_url || null,
      image_base64: image_base64 || null,
      audio_url: audio_url || null,
      audio_base64: audio_base64 || null,
      resolution: resolution || '480p', // Default to 480p for fast
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk-fast',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk Fast job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

/**
 * POST /api/v1/infinitetalk/multi - Infinitetalk Multi
 */
router.post('/multi', async (req, res) => {
  try {
    const {
      image_url, image_base64,
      audio_url_1, audio_base64_1,
      audio_url_2, audio_base64_2,
      order, resolution, seed,
      workflow_id, callback_url
    } = req.body;

    // Validate base64 size (max 20MB for images, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64_1', 'audio_base64_2'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation
    if (!image_url && !image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either image_url or image_base64 is required'
        }
      });
    }

    if (image_url && image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either image_url or image_base64, not both'
        }
      });
    }

    // First audio validation
    if (!audio_url_1 && !audio_base64_1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url_1 or audio_base64_1 is required'
        }
      });
    }

    if (audio_url_1 && audio_base64_1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url_1 or audio_base64_1, not both'
        }
      });
    }

    // Second audio validation
    if (!audio_url_2 && !audio_base64_2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url_2 or audio_base64_2 is required'
        }
      });
    }

    if (audio_url_2 && audio_base64_2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url_2 or audio_base64_2, not both'
        }
      });
    }

    // Order validation
    const validOrders = ['meanwhile', 'sequential'];
    if (order && !validOrders.includes(order)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: `Invalid order. Must be one of: ${validOrders.join(', ')}`
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      image_url: image_url || null,
      image_base64: image_base64 || null,
      audio_url_1: audio_url_1 || null,
      audio_base64_1: audio_base64_1 || null,
      audio_url_2: audio_url_2 || null,
      audio_base64_2: audio_base64_2 || null,
      order: order || 'meanwhile',
      resolution: resolution || '720p',
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk-multi',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk Multi job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

/**
 * POST /api/v1/infinitetalk/fast-multi - Infinitetalk Fast Multi
 */
router.post('/fast-multi', async (req, res) => {
  try {
    const {
      image_url, image_base64,
      audio_url_1, audio_base64_1,
      audio_url_2, audio_base64_2,
      order, resolution, seed,
      workflow_id, callback_url
    } = req.body;

    // Validate base64 size (max 20MB for images, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64_1', 'audio_base64_2'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation (same as multi)
    if (!image_url && !image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either image_url or image_base64 is required'
        }
      });
    }

    if (image_url && image_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either image_url or image_base64, not both'
        }
      });
    }

    if (!audio_url_1 && !audio_base64_1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url_1 or audio_base64_1 is required'
        }
      });
    }

    if (audio_url_1 && audio_base64_1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url_1 or audio_base64_1, not both'
        }
      });
    }

    if (!audio_url_2 && !audio_base64_2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url_2 or audio_base64_2 is required'
        }
      });
    }

    if (audio_url_2 && audio_base64_2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url_2 or audio_base64_2, not both'
        }
      });
    }

    const validOrders = ['meanwhile', 'sequential'];
    if (order && !validOrders.includes(order)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: `Invalid order. Must be one of: ${validOrders.join(', ')}`
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      image_url: image_url || null,
      image_base64: image_base64 || null,
      audio_url_1: audio_url_1 || null,
      audio_base64_1: audio_base64_1 || null,
      audio_url_2: audio_url_2 || null,
      audio_base64_2: audio_base64_2 || null,
      order: order || 'meanwhile',
      resolution: resolution || '480p', // Default to 480p for fast
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk-fast-multi',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk Fast Multi job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

/**
 * POST /api/v1/infinitetalk/video-to-video - Infinitetalk Video-to-Video
 */
router.post('/video-to-video', async (req, res) => {
  try {
    const { video_url, video_base64, audio_url, audio_base64, prompt, resolution, seed, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 50MB for videos, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['video_base64'], 50);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation
    if (!video_url && !video_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either video_url or video_base64 is required'
        }
      });
    }

    if (video_url && video_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either video_url or video_base64, not both'
        }
      });
    }

    if (!audio_url && !audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url or audio_base64 is required'
        }
      });
    }

    if (audio_url && audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url or audio_base64, not both'
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      video_url: video_url || null,
      video_base64: video_base64 || null,
      audio_url: audio_url || null,
      audio_base64: audio_base64 || null,
      prompt: prompt || '',
      resolution: resolution || '720p',
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk-video-to-video',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk V2V job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

/**
 * POST /api/v1/infinitetalk/fast-video-to-video - Infinitetalk Fast Video-to-Video
 */
router.post('/fast-video-to-video', async (req, res) => {
  try {
    const { video_url, video_base64, audio_url, audio_base64, prompt, resolution, seed, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 50MB for videos, 10MB for audio)
    const base64Validation = validateBase64Fields(req.body, ['video_base64'], 50);
    const audioValidation = validateBase64Fields(req.body, ['audio_base64'], 10);

    if (!base64Validation.valid || !audioValidation.valid) {
      const errors = [...base64Validation.errors, ...audioValidation.errors];
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: errors.join('; ')
        }
      });
    }

    // Validation (same as video-to-video)
    if (!video_url && !video_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either video_url or video_base64 is required'
        }
      });
    }

    if (video_url && video_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either video_url or video_base64, not both'
        }
      });
    }

    if (!audio_url && !audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Either audio_url or audio_base64 is required'
        }
      });
    }

    if (audio_url && audio_base64) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Provide either audio_url or audio_base64, not both'
        }
      });
    }

    const validationErrors = validateInfinitetalkParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // Create job
    const requestPayload = {
      video_url: video_url || null,
      video_base64: video_base64 || null,
      audio_url: audio_url || null,
      audio_base64: audio_base64 || null,
      prompt: prompt || '',
      resolution: resolution || '480p', // Default to 480p for fast
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'infinitetalk-fast-video-to-video',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    logger.error('Error creating Infinitetalk Fast V2V job:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: 'Failed to create job'
      }
    });
  }
});

module.exports = router;
