# ComfyUI API Implementation Guide

**Developer guide for implementing model endpoints**

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setting Up a New Endpoint](#setting-up-a-new-endpoint)
3. [Code Examples](#code-examples)
4. [Workflow Integration](#workflow-integration)
5. [Testing](#testing)
6. [Deployment](#deployment)

---

## Architecture Overview

### Request Flow

```
Client Request
    ↓
API Gateway (Express Router)
    ↓
Authentication Middleware
    ↓
Rate Limiting Middleware
    ↓
Validation Middleware
    ↓
Route Handler
    ↓
Service Layer (Business Logic)
    ↓
Job Service (Create Job)
    ↓
Queue Job
    ↓
Return Job Info to Client
    ↓
[Background] Job Processor
    ↓
Download Input Media
    ↓
Workflow Service (Map Parameters)
    ↓
ComfyUI Client (Execute Workflow)
    ↓
WebSocket Events (Progress Updates)
    ↓
Upload Result to Storage
    ↓
Update Job Status
    ↓
Send Webhook Notification (if configured)
```

### Directory Structure

```
backend/src/
├── routes/
│   └── models/
│       ├── index.js                      # Main router
│       ├── videoProcessing/
│       │   ├── flashvsr.js
│       │   ├── rife.js
│       │   └── topaz.js
│       ├── textToVideo/
│       │   ├── veo.js
│       │   ├── kling.js
│       │   └── hailuo.js
│       ├── imageToVideo/
│       │   └── ...
│       └── specialized/
│           ├── multitalk.js
│           └── omnihuman.js
├── services/
│   ├── models/
│   │   ├── videoProcessingService.js
│   │   ├── textToVideoService.js
│   │   └── imageToVideoService.js
│   ├── workflowService.js
│   ├── parameterMapper.js
│   └── mediaDownloader.js
├── validators/
│   ├── models/
│   │   ├── flashvsrValidator.js
│   │   └── commonValidator.js
│   └── index.js
├── middleware/
│   ├── auth.js
│   ├── rateLimit.js
│   └── validation.js
└── utils/
    ├── logger.js
    ├── errors.js
    └── pricing.js
```

---

## Setting Up a New Endpoint

### Step 1: Create Route File

**File**: `backend/src/routes/models/videoProcessing/flashvsr.js`

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../middleware/auth');
const { validateRequest } = require('../../../middleware/validation');
const { flashvsrUpscaleSchema } = require('../../../validators/models/flashvsrValidator');
const videoProcessingService = require('../../../services/models/videoProcessingService');
const logger = require('../../../utils/logger');

/**
 * POST /api/v1/models/flashvsr/upscale/video
 * FlashVSR video upscaling endpoint
 */
router.post('/upscale/video',
  authenticate,
  validateRequest(flashvsrUpscaleSchema),
  async (req, res, next) => {
    try {
      logger.info('FlashVSR upscale request received', {
        userId: req.user.id,
        params: req.body
      });

      const job = await videoProcessingService.createFlashVSRJob(
        req.user.id,
        req.body
      );

      res.status(202).json({
        job_id: job.id,
        status: job.status,
        request_id: job.request_id,
        created_at: job.created_at,
        urls: {
          status: `/api/v1/jobs/${job.id}/status`,
          result: `/api/v1/jobs/${job.id}`,
          cancel: `/api/v1/jobs/${job.id}/cancel`
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
```

### Step 2: Create Validator

**File**: `backend/src/validators/models/flashvsrValidator.js`

```javascript
const Joi = require('joi');

const flashvsrUpscaleSchema = Joi.object({
  video_url: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'video_url must be a valid URL',
      'any.required': 'video_url is required'
    }),

  scale_factor: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .default(2)
    .messages({
      'number.min': 'scale_factor must be between 1 and 4',
      'number.max': 'scale_factor must be between 1 and 4'
    }),

  output_format: Joi.string()
    .valid('mp4', 'mov', 'webm')
    .default('mp4'),

  webhook_url: Joi.string()
    .uri()
    .allow(null)
    .optional(),

  sync_mode: Joi.boolean()
    .default(false),

  priority: Joi.string()
    .valid('low', 'normal', 'high')
    .default('normal'),

  idempotency_key: Joi.string()
    .optional()
});

module.exports = {
  flashvsrUpscaleSchema
};
```

### Step 3: Create Service

**File**: `backend/src/services/models/videoProcessingService.js`

```javascript
const jobService = require('../jobService');
const workflowService = require('../workflowService');
const parameterMapper = require('../parameterMapper');
const mediaDownloader = require('../mediaDownloader');
const { calculatePricing } = require('../../utils/pricing');
const { AppError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class VideoProcessingService {
  /**
   * Create FlashVSR upscaling job
   */
  async createFlashVSRJob(userId, params) {
    const {
      video_url,
      scale_factor = 2,
      output_format = 'mp4',
      webhook_url = null,
      sync_mode = false,
      priority = 'normal',
      idempotency_key = null
    } = params;

    try {
      // Check for duplicate request (idempotency)
      if (idempotency_key) {
        const existingJob = await jobService.findByIdempotencyKey(
          userId,
          idempotency_key
        );
        if (existingJob) {
          logger.info('Returning existing job for idempotency key', {
            jobId: existingJob.id,
            idempotencyKey: idempotency_key
          });
          return existingJob;
        }
      }

      // Download input video to get metadata
      const videoInfo = await mediaDownloader.getVideoInfo(video_url);

      // Calculate pricing
      const pricing = calculatePricing('flashvsr', {
        width: videoInfo.width,
        height: videoInfo.height,
        frames: videoInfo.frames,
        scale_factor
      });

      // Check user credits
      const userCredits = await jobService.getUserCredits(userId);
      if (userCredits < pricing.cost) {
        throw new AppError('INSUFFICIENT_CREDITS', 402,
          `Insufficient credits. Required: ${pricing.cost}, Available: ${userCredits}`
        );
      }

      // Load workflow template
      const workflowTemplate = await workflowService.loadWorkflow('flashvsr_upscale');

      // Map parameters to workflow
      const workflowParams = parameterMapper.mapFlashVSRParams({
        video_url,
        scale_factor,
        output_format,
        videoInfo
      });

      // Create job
      const job = await jobService.createJob({
        userId,
        workflowId: workflowTemplate.id,
        workflowParams,
        jobType: 'flashvsr_upscale',
        priority,
        estimatedCost: pricing.cost,
        webhookUrl: webhook_url,
        idempotencyKey: idempotency_key,
        metadata: {
          input_url: video_url,
          scale_factor,
          output_format,
          video_info: videoInfo,
          pricing
        }
      });

      logger.info('FlashVSR job created', {
        jobId: job.id,
        userId,
        estimatedCost: pricing.cost
      });

      // If sync mode, wait for completion
      if (sync_mode) {
        const result = await jobService.waitForCompletion(job.id, {
          timeout: 600000, // 10 minutes
          pollInterval: 2000
        });
        return result;
      }

      return job;
    } catch (error) {
      logger.error('Error creating FlashVSR job', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create RIFE video interpolation job
   */
  async createRIFEVideoJob(userId, params) {
    // Similar implementation...
  }
}

module.exports = new VideoProcessingService();
```

### Step 4: Create Parameter Mapper

**File**: `backend/src/services/parameterMapper.js`

```javascript
const path = require('path');

class ParameterMapper {
  /**
   * Map FlashVSR API parameters to ComfyUI workflow parameters
   */
  mapFlashVSRParams({ video_url, scale_factor, output_format, videoInfo }) {
    const outputFilename = `flashvsr_${Date.now()}_${scale_factor}x`;

    return {
      // Input video path (will be downloaded to this location)
      video_path: `/tmp/inputs/${path.basename(video_url)}`,
      video_url: video_url,

      // Processing parameters
      scale_factor: scale_factor,
      upscale_model: 'flashvsr',

      // Output parameters
      output_path: `/app/output/${outputFilename}`,
      output_format: output_format,
      output_filename: outputFilename,

      // Video metadata
      input_width: videoInfo.width,
      input_height: videoInfo.height,
      input_fps: videoInfo.fps,
      input_frames: videoInfo.frames,

      // Calculated output dimensions
      output_width: videoInfo.width * scale_factor,
      output_height: videoInfo.height * scale_factor
    };
  }

  /**
   * Map Veo text-to-video parameters
   */
  mapVeoTextToVideoParams({
    prompt,
    negative_prompt = '',
    duration = 5,
    aspect_ratio = '16:9',
    fps = 24,
    seed = null,
    guidance_scale = 7.5,
    num_inference_steps = 50
  }) {
    const [width, height] = this.aspectRatioToDimensions(aspect_ratio);
    const randomSeed = seed || Math.floor(Math.random() * 1000000);

    return {
      prompt: prompt,
      negative_prompt: negative_prompt,
      width: width,
      height: height,
      num_frames: duration * fps,
      fps: fps,
      seed: randomSeed,
      guidance_scale: guidance_scale,
      num_inference_steps: num_inference_steps,
      output_path: `/app/output/veo_${Date.now()}`,
      output_format: 'mp4'
    };
  }

  /**
   * Convert aspect ratio to dimensions
   */
  aspectRatioToDimensions(aspectRatio) {
    const ratios = {
      '16:9': [1920, 1080],
      '9:16': [1080, 1920],
      '1:1': [1080, 1080],
      '4:3': [1440, 1080],
      '21:9': [2560, 1080]
    };

    return ratios[aspectRatio] || ratios['16:9'];
  }

  /**
   * Map MultiTalk parameters
   */
  mapMultiTalkParams({
    image_url,
    text = null,
    audio_url = null,
    voice = 'en-US-female-1',
    emotion = 'neutral',
    lip_sync_quality = 'high'
  }) {
    return {
      image_path: `/tmp/inputs/${path.basename(image_url)}`,
      image_url: image_url,
      text: text,
      audio_path: audio_url ? `/tmp/inputs/${path.basename(audio_url)}` : null,
      audio_url: audio_url,
      voice_id: voice,
      emotion: emotion,
      lip_sync_quality: lip_sync_quality,
      output_path: `/app/output/multitalk_${Date.now()}`,
      output_format: 'mp4'
    };
  }
}

module.exports = new ParameterMapper();
```

### Step 5: Create Media Downloader Service

**File**: `backend/src/services/mediaDownloader.js`

```javascript
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

class MediaDownloader {
  constructor() {
    this.tempDir = '/tmp/inputs';
    this.maxFileSize = 500 * 1024 * 1024; // 500MB
  }

  /**
   * Download video and get metadata
   */
  async getVideoInfo(videoUrl) {
    try {
      // Download video to temp location
      const tempPath = await this.downloadFile(videoUrl, this.tempDir);

      // Get video metadata using ffprobe
      const metadata = await this.extractVideoMetadata(tempPath);

      logger.info('Video info extracted', {
        url: videoUrl,
        metadata
      });

      return metadata;
    } catch (error) {
      logger.error('Error getting video info', {
        url: videoUrl,
        error: error.message
      });
      throw new AppError('VIDEO_DOWNLOAD_ERROR', 400,
        `Failed to download or analyze video: ${error.message}`
      );
    }
  }

  /**
   * Download file from URL
   */
  async downloadFile(url, destDir) {
    try {
      // Ensure directory exists
      await fs.mkdir(destDir, { recursive: true });

      const filename = path.basename(url).split('?')[0];
      const filepath = path.join(destDir, filename);

      // Stream download
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        maxContentLength: this.maxFileSize,
        timeout: 120000 // 2 minutes
      });

      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filepath));
        writer.on('error', reject);
      });
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new AppError('DOWNLOAD_TIMEOUT', 408, 'File download timeout');
      }
      if (error.response && error.response.status === 404) {
        throw new AppError('FILE_NOT_FOUND', 404, 'Input file not found at URL');
      }
      throw error;
    }
  }

  /**
   * Extract video metadata using ffprobe
   */
  async extractVideoMetadata(filepath) {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filepath}"`;
      const output = execSync(command, { encoding: 'utf8' });
      const data = JSON.parse(output);

      const videoStream = data.streams.find(s => s.codec_type === 'video');

      if (!videoStream) {
        throw new Error('No video stream found');
      }

      // Calculate total frames
      const duration = parseFloat(data.format.duration);
      const fps = eval(videoStream.r_frame_rate); // e.g., "24/1" -> 24
      const frames = Math.round(duration * fps);

      return {
        width: videoStream.width,
        height: videoStream.height,
        fps: fps,
        duration: duration,
        frames: frames,
        codec: videoStream.codec_name,
        bitrate: parseInt(data.format.bit_rate),
        size: parseInt(data.format.size)
      };
    } catch (error) {
      throw new AppError('METADATA_EXTRACTION_ERROR', 400,
        `Failed to extract video metadata: ${error.message}`
      );
    }
  }

  /**
   * Validate video format
   */
  validateVideoFormat(metadata, allowedFormats = ['mp4', 'mov', 'webm', 'm4v', 'avi']) {
    if (!allowedFormats.includes(metadata.codec.toLowerCase())) {
      throw new AppError('INVALID_VIDEO_FORMAT', 400,
        `Video format '${metadata.codec}' not supported. Allowed: ${allowedFormats.join(', ')}`
      );
    }
  }
}

module.exports = new MediaDownloader();
```

### Step 6: Create Pricing Utility

**File**: `backend/src/utils/pricing.js`

```javascript
/**
 * Calculate pricing for different models
 */
class PricingCalculator {
  constructor() {
    // Price per megapixel
    this.rates = {
      flashvsr: 0.0005,
      topaz: 0.001,
      rife: 0.0003,
      seedvr: 0.0008,
      veo: 0.50, // flat rate per generation
      kling: 0.60,
      hailuo: 0.40,
      multitalk: 0.0002 // per frame
    };
  }

  /**
   * Calculate cost for video processing
   */
  calculatePricing(modelType, params) {
    const { width, height, frames, scale_factor = 1 } = params;

    let cost = 0;
    let megapixels = 0;

    switch (modelType) {
      case 'flashvsr':
      case 'topaz':
      case 'rife':
      case 'seedvr':
        // Calculate output megapixels
        const outputWidth = width * scale_factor;
        const outputHeight = height * scale_factor;
        megapixels = (outputWidth * outputHeight * frames) / 1000000;
        cost = megapixels * this.rates[modelType];
        break;

      case 'veo':
      case 'kling':
      case 'hailuo':
        // Flat rate for generation
        cost = this.rates[modelType];
        break;

      case 'multitalk':
        // Per frame pricing
        cost = frames * this.rates[modelType];
        break;

      default:
        cost = 0.01; // Default small cost
    }

    return {
      cost: parseFloat(cost.toFixed(4)),
      megapixels: parseFloat(megapixels.toFixed(2)),
      rate: this.rates[modelType],
      modelType
    };
  }

  /**
   * Get pricing info for model
   */
  getModelPricing(modelType) {
    return {
      modelType,
      rate: this.rates[modelType],
      unit: this.getPricingUnit(modelType)
    };
  }

  /**
   * Get pricing unit
   */
  getPricingUnit(modelType) {
    if (['flashvsr', 'topaz', 'rife', 'seedvsr'].includes(modelType)) {
      return 'per megapixel';
    } else if (['veo', 'kling', 'hailuo'].includes(modelType)) {
      return 'per generation';
    } else if (modelType === 'multitalk') {
      return 'per frame';
    }
    return 'per request';
  }
}

module.exports = new PricingCalculator();
```

### Step 7: Update Main Routes

**File**: `backend/src/routes/models/index.js`

```javascript
const express = require('express');
const router = express.Router();

// Video Processing
const flashvsrRoutes = require('./videoProcessing/flashvsr');
const rifeRoutes = require('./videoProcessing/rife');
const topazRoutes = require('./videoProcessing/topaz');
const seedvrRoutes = require('./videoProcessing/seedvr');

// Text-to-Video
const veoRoutes = require('./textToVideo/veo');
const klingRoutes = require('./textToVideo/kling');
const hailuoRoutes = require('./textToVideo/hailuo');

// Image-to-Video
// ... (similar imports)

// Specialized
const multitalkRoutes = require('./specialized/multitalk');
const omnihumanRoutes = require('./specialized/omnihuman');

// Mount routes
router.use('/flashvsr', flashvsrRoutes);
router.use('/rife', rifeRoutes);
router.use('/topaz', topazRoutes);
router.use('/seedvr', seedvrRoutes);

router.use('/veo', veoRoutes);
router.use('/kling', klingRoutes);
router.use('/hailuo', hailuoRoutes);

router.use('/multitalk', multitalkRoutes);
router.use('/omnihuman', omnihumanRoutes);

module.exports = router;
```

**File**: `backend/src/index.js` (update)

```javascript
// ... existing imports

const modelsRouter = require('./routes/models');

// ... existing middleware

// Mount models router
app.use('/api/v1/models', modelsRouter);

// ... rest of the app
```

---

## Workflow Integration

### Creating ComfyUI Workflows

**File**: `workflows/flashvsr_upscale.json`

```json
{
  "workflow_name": "flashvsr_upscale",
  "description": "FlashVSR Video Upscaling",
  "version": "1.0",
  "parameters": {
    "video_url": "{{video_url}}",
    "video_path": "{{video_path}}",
    "scale_factor": "{{scale_factor}}",
    "output_path": "{{output_path}}",
    "output_format": "{{output_format}}"
  },
  "workflow": {
    "1": {
      "class_type": "VHS_LoadVideo",
      "inputs": {
        "video": "{{video_path}}",
        "force_rate": 0,
        "force_size": "Disabled",
        "custom_width": 512,
        "custom_height": 512,
        "frame_load_cap": 0,
        "skip_first_frames": 0,
        "select_every_nth": 1
      }
    },
    "2": {
      "class_type": "FlashVSRUpscale",
      "inputs": {
        "images": ["1", 0],
        "scale": "{{scale_factor}}",
        "model": "flashvsr"
      }
    },
    "3": {
      "class_type": "VHS_VideoCombine",
      "inputs": {
        "images": ["2", 0],
        "frame_rate": 24,
        "loop_count": 0,
        "filename_prefix": "{{output_filename}}",
        "format": "{{output_format}}",
        "save_output": true
      }
    }
  }
}
```

### Workflow Service

**File**: `backend/src/services/workflowService.js`

```javascript
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

class WorkflowService {
  constructor() {
    this.workflowsDir = path.join(__dirname, '../../workflows');
    this.workflowCache = new Map();
  }

  /**
   * Load workflow template
   */
  async loadWorkflow(workflowName) {
    try {
      // Check cache first
      if (this.workflowCache.has(workflowName)) {
        return this.workflowCache.get(workflowName);
      }

      const workflowPath = path.join(this.workflowsDir, `${workflowName}.json`);
      const content = await fs.readFile(workflowPath, 'utf8');
      const workflow = JSON.parse(content);

      // Cache it
      this.workflowCache.set(workflowName, workflow);

      logger.info('Workflow loaded', { workflowName });

      return workflow;
    } catch (error) {
      logger.error('Failed to load workflow', {
        workflowName,
        error: error.message
      });
      throw new AppError('WORKFLOW_NOT_FOUND', 404,
        `Workflow '${workflowName}' not found`
      );
    }
  }

  /**
   * Substitute parameters in workflow
   */
  substituteParameters(workflow, params) {
    let workflowStr = JSON.stringify(workflow);

    // Replace all {{parameter}} placeholders
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      const regex = new RegExp(placeholder, 'g');
      workflowStr = workflowStr.replace(regex, value);
    }

    // Check for any remaining placeholders
    const remainingPlaceholders = workflowStr.match(/{{.*?}}/g);
    if (remainingPlaceholders) {
      logger.warn('Workflow has unsubstituted parameters', {
        placeholders: remainingPlaceholders
      });
    }

    return JSON.parse(workflowStr);
  }

  /**
   * Get workflow with substituted parameters
   */
  async getWorkflowWithParams(workflowName, params) {
    const workflow = await this.loadWorkflow(workflowName);
    return this.substituteParameters(workflow.workflow, params);
  }
}

module.exports = new WorkflowService();
```

---

## Testing

### Unit Tests

**File**: `backend/tests/services/videoProcessingService.test.js`

```javascript
const videoProcessingService = require('../../src/services/models/videoProcessingService');
const jobService = require('../../src/services/jobService');
const mediaDownloader = require('../../src/services/mediaDownloader');

jest.mock('../../src/services/jobService');
jest.mock('../../src/services/mediaDownloader');

describe('VideoProcessingService', () => {
  describe('createFlashVSRJob', () => {
    it('should create a FlashVSR upscaling job successfully', async () => {
      // Mock video info
      mediaDownloader.getVideoInfo.mockResolvedValue({
        width: 1920,
        height: 1080,
        fps: 24,
        frames: 120,
        duration: 5
      });

      // Mock user credits
      jobService.getUserCredits.mockResolvedValue(10.0);

      // Mock job creation
      jobService.createJob.mockResolvedValue({
        id: 'job-123',
        status: 'queued',
        created_at: new Date()
      });

      const userId = 'user-456';
      const params = {
        video_url: 'https://example.com/video.mp4',
        scale_factor: 2
      };

      const job = await videoProcessingService.createFlashVSRJob(userId, params);

      expect(job).toBeDefined();
      expect(job.id).toBe('job-123');
      expect(job.status).toBe('queued');
      expect(jobService.createJob).toHaveBeenCalledTimes(1);
    });

    it('should throw error if insufficient credits', async () => {
      mediaDownloader.getVideoInfo.mockResolvedValue({
        width: 1920,
        height: 1080,
        fps: 24,
        frames: 120
      });

      jobService.getUserCredits.mockResolvedValue(0.01);

      const userId = 'user-456';
      const params = {
        video_url: 'https://example.com/video.mp4',
        scale_factor: 2
      };

      await expect(
        videoProcessingService.createFlashVSRJob(userId, params)
      ).rejects.toThrow('INSUFFICIENT_CREDITS');
    });
  });
});
```

### Integration Tests

**File**: `backend/tests/integration/flashvsr.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('FlashVSR API Integration', () => {
  let apiKey;

  beforeAll(async () => {
    // Create test API key
    apiKey = await createTestAPIKey();
  });

  describe('POST /api/v1/models/flashvsr/upscale/video', () => {
    it('should create a job successfully', async () => {
      const response = await request(app)
        .post('/api/v1/models/flashvsr/upscale/video')
        .set('Authorization', `Key ${apiKey}`)
        .send({
          video_url: 'https://example.com/test-video.mp4',
          scale_factor: 2
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('job_id');
      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body).toHaveProperty('urls');
    });

    it('should return 400 for invalid video URL', async () => {
      const response = await request(app)
        .post('/api/v1/models/flashvsr/upscale/video')
        .set('Authorization', `Key ${apiKey}`)
        .send({
          video_url: 'not-a-valid-url',
          scale_factor: 2
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for missing API key', async () => {
      const response = await request(app)
        .post('/api/v1/models/flashvsr/upscale/video')
        .send({
          video_url: 'https://example.com/test-video.mp4'
        });

      expect(response.status).toBe(401);
    });
  });
});
```

### End-to-End Tests

**File**: `backend/tests/e2e/flashvsr.e2e.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('FlashVSR E2E', () => {
  it('should process video from submission to completion', async () => {
    const apiKey = process.env.TEST_API_KEY;

    // Submit job
    const submitResponse = await request(app)
      .post('/api/v1/models/flashvsr/upscale/video')
      .set('Authorization', `Key ${apiKey}`)
      .send({
        video_url: 'https://example.com/test-short-video.mp4',
        scale_factor: 2
      });

    expect(submitResponse.status).toBe(202);
    const jobId = submitResponse.body.job_id;

    // Poll for completion
    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await request(app)
        .get(`/api/v1/jobs/${jobId}/status`)
        .set('Authorization', `Key ${apiKey}`);

      status = statusResponse.body.status;
      attempts++;
    }

    expect(status).toBe('completed');

    // Get result
    const resultResponse = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Key ${apiKey}`);

    expect(resultResponse.body).toHaveProperty('result');
    expect(resultResponse.body.result).toHaveProperty('video_url');
  }, 180000); // 3 minute timeout
});
```

---

## Deployment

### Environment Variables

```bash
# .env.production
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/comfyui_api

# Authentication
JWT_SECRET=your-secret-key
API_KEY_ENCRYPTION_KEY=your-encryption-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_MAX_JOBS_PER_MIN=10

# ComfyUI
COMFYUI_BASE_URL=http://comfyui:8188
COMFYUI_WS_URL=ws://comfyui:8188/ws

# Storage
MEDIA_STORAGE_TYPE=s3
AWS_S3_BUCKET=comfyui-outputs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Pricing
FLASHVSR_PRICE_PER_MP=0.0005
TOPAZ_PRICE_PER_MP=0.001
RIFE_PRICE_PER_MP=0.0003

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info

# Webhooks
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_ATTEMPTS=3
```

### Docker Compose Update

```yaml
# docker-compose.yml (add to services)
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/comfyui_api
      - COMFYUI_BASE_URL=http://comfyui:8188
    volumes:
      - ./workflows:/app/workflows:ro
      - ./output:/app/output
    depends_on:
      - db
      - comfyui
```

### Nginx Configuration

```nginx
# nginx.conf
upstream api_backend {
    server backend:3000;
}

server {
    listen 80;
    server_name api.example.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;

    location /api/v1/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # WebSocket for streaming
    location /api/v1/jobs/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Monitoring & Logging

### Logger Setup

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'comfyui-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;
```

### Request Logging Middleware

```javascript
// src/middleware/requestLogger.js
const logger = require('../utils/logger');

module.exports = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      ip: req.ip
    });
  });

  next();
};
```

---

## Best Practices

1. **Always validate input parameters** - Use Joi schemas
2. **Implement proper error handling** - Use custom error classes
3. **Log everything** - Request/response, errors, processing steps
4. **Use async/await** - Avoid callback hell
5. **Implement rate limiting** - Per user, per endpoint
6. **Cache workflows** - Load once, use many times
7. **Download media async** - Don't block the request
8. **Calculate costs before processing** - Check credits first
9. **Use transactions for DB operations** - Ensure data consistency
10. **Implement idempotency** - Prevent duplicate processing

---

**Document End**
