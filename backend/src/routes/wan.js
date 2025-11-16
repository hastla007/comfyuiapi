const express = require('express');
const router = express.Router();
const { createJob } = require('../services/jobService');
const { authenticateApiKey } = require('../middleware/auth');
const { validateBase64Fields } = require('../utils/validation');

// Apply authentication middleware to all WAN routes
router.use(authenticateApiKey);

/**
 * Validate common WAN parameters
 */
function validateWanParams(body, version = '2.2') {
  const errors = [];

  // Resolution validation
  const validResolutions = version === '2.2'
    ? ['480p', '580p', '720p']
    : ['720p', '1080p'];

  if (body.resolution && !validResolutions.includes(body.resolution)) {
    errors.push(`Invalid resolution. Must be one of: ${validResolutions.join(', ')}`);
  }

  // Aspect ratio validation
  const validAspectRatios = ['16:9', '9:16', '1:1'];
  if (body.aspect_ratio && !validAspectRatios.includes(body.aspect_ratio)) {
    errors.push(`Invalid aspect_ratio. Must be one of: ${validAspectRatios.join(', ')}`);
  }

  // Duration validation
  if (body.duration !== undefined) {
    const duration = parseInt(body.duration, 10);
    if (isNaN(duration) || duration < 1 || duration > 10) {
      errors.push('Invalid duration. Must be between 1 and 10 seconds');
    }
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
 * POST /api/v1/wan/2.2/text-to-video-turbo
 */
router.post('/2.2/text-to-video-turbo', async (req, res) => {
  try {
    const { prompt, resolution, aspect_ratio, duration, seed, negative_prompt, workflow_id, callback_url } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'prompt is required'
        }
      });
    }

    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 800) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'prompt must be a string between 1 and 800 characters'
        }
      });
    }

    const validationErrors = validateWanParams(req.body, '2.2');
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
      prompt,
      resolution: resolution || '720p',
      aspect_ratio: aspect_ratio || '16:9',
      duration: duration || 5,
      seed: seed !== undefined ? seed : -1,
      negative_prompt: negative_prompt || ''
    };

    const job = await createJob(
      req.user.id,
      'wan-2.2-text-to-video-turbo',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating WAN 2.2 T2V job:', error);
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
 * POST /api/v1/wan/2.2/image-to-video-turbo
 */
router.post('/2.2/image-to-video-turbo', async (req, res) => {
  try {
    const { image_url, image_base64, prompt, resolution, aspect_ratio, duration, seed, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 20MB for images)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    if (!base64Validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: base64Validation.errors.join('; ')
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

    const validationErrors = validateWanParams(req.body, '2.2');
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
      prompt: prompt || '',
      resolution: resolution || '720p',
      aspect_ratio: aspect_ratio || '16:9',
      duration: duration || 5,
      seed: seed !== undefined ? seed : -1
    };

    const job = await createJob(
      req.user.id,
      'wan-2.2-image-to-video-turbo',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating WAN 2.2 I2V job:', error);
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
 * POST /api/v1/wan/2.5/text-to-video
 */
router.post('/2.5/text-to-video', async (req, res) => {
  try {
    const { prompt, resolution, aspect_ratio, duration, fps, seed, negative_prompt, audio_sync, workflow_id, callback_url } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'prompt is required'
        }
      });
    }

    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 800) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: 'prompt must be a string between 1 and 800 characters'
        }
      });
    }

    const validationErrors = validateWanParams(req.body, '2.5');
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // FPS validation
    if (fps !== undefined) {
      const fpsValue = parseInt(fps, 10);
      if (isNaN(fpsValue) || fpsValue < 1 || fpsValue > 60) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'invalid_request',
            message: 'fps must be between 1 and 60'
          }
        });
      }
    }

    // Create job
    const requestPayload = {
      prompt,
      resolution: resolution || '720p',
      aspect_ratio: aspect_ratio || '16:9',
      duration: duration || 5,
      fps: fps || 24,
      seed: seed !== undefined ? seed : -1,
      negative_prompt: negative_prompt || '',
      audio_sync: audio_sync !== undefined ? audio_sync : true
    };

    const job = await createJob(
      req.user.id,
      'wan-2.5-text-to-video',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating WAN 2.5 T2V job:', error);
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
 * POST /api/v1/wan/2.5/image-to-video
 */
router.post('/2.5/image-to-video', async (req, res) => {
  try {
    const { image_url, image_base64, prompt, resolution, aspect_ratio, duration, fps, seed, audio_sync, workflow_id, callback_url } = req.body;

    // Validate base64 size (max 20MB for images)
    const base64Validation = validateBase64Fields(req.body, ['image_base64'], 20);
    if (!base64Validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: base64Validation.errors.join('; ')
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

    const validationErrors = validateWanParams(req.body, '2.5');
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_request',
          message: validationErrors.join('; ')
        }
      });
    }

    // FPS validation
    if (fps !== undefined) {
      const fpsValue = parseInt(fps, 10);
      if (isNaN(fpsValue) || fpsValue < 1 || fpsValue > 60) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'invalid_request',
            message: 'fps must be between 1 and 60'
          }
        });
      }
    }

    // Create job
    const requestPayload = {
      image_url: image_url || null,
      image_base64: image_base64 || null,
      prompt: prompt || '',
      resolution: resolution || '720p',
      aspect_ratio: aspect_ratio || '16:9',
      duration: duration || 5,
      fps: fps || 24,
      seed: seed !== undefined ? seed : -1,
      audio_sync: audio_sync !== undefined ? audio_sync : true
    };

    const job = await createJob(
      req.user.id,
      'wan-2.5-image-to-video',
      requestPayload,
      workflow_id || null,
      callback_url || null
    );

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating WAN 2.5 I2V job:', error);
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
