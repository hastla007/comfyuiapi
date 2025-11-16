# ComfyUI API Architecture Design

**Version:** 1.0
**Date:** 2025-11-16
**Status:** Design Phase

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [API Structure](#api-structure)
4. [Authentication](#authentication)
5. [Endpoint Categories](#endpoint-categories)
6. [Request/Response Format](#requestresponse-format)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

This document defines the API architecture for ComfyUI workflow endpoints that are compatible with fal.ai's API structure but with custom branding (removing "fal-ai" from all URLs).

### Compatibility Goals
- **fal.ai Compatible**: Maintain the same request/response format as fal.ai
- **Clean URLs**: Remove "fal-ai" prefix from all endpoint paths
- **Extensible**: Support adding new models and workflows easily
- **ComfyUI Native**: All endpoints execute via ComfyUI workflows

### Base URL Structure

```
Production: https://api.yourcompanyname.com
Development: http://localhost:3000/api
```

**Pattern**: `/models/{model-name}/{capability}/{media-type}`

**Examples**:
- `/models/flashvsr/upscale/video` (instead of `/models/fal-ai/flashvsr/upscale/video`)
- `/models/rife/video` (instead of `/models/fal-ai/rife/video`)
- `/models/veo/3.1/text-to-video` (instead of `/models/fal-ai/veo/3.1/text-to-video`)

---

## Design Principles

1. **RESTful Design**: Follow REST conventions for resource naming and HTTP methods
2. **Async by Default**: All video generation/processing is asynchronous via job queue
3. **Webhook Support**: Optional webhooks for job completion notifications
4. **Streaming Support**: Real-time progress updates via WebSocket or SSE
5. **Versioning**: API version in path (e.g., `/api/v1/models/...`)
6. **Idempotency**: Support idempotent requests with unique request IDs

---

## API Structure

### Endpoint Hierarchy

```
/api/v1/
├── models/
│   ├── {model-category}/
│   │   ├── {version}/
│   │   │   └── {capability}/
│   │   └── {capability}/
│   │       └── {media-type}/
│   └── ...
├── jobs/
│   ├── {job-id}/
│   ├── {job-id}/status
│   ├── {job-id}/cancel
│   └── {job-id}/retry
├── webhooks/
│   ├── register
│   ├── {webhook-id}
│   └── {webhook-id}/test
└── queue/
    ├── status
    └── stats
```

### URL Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| `/models/{model}/{capability}` | `/models/rife/video` | Simple model endpoint |
| `/models/{model}/{version}/{capability}` | `/models/veo/3.1/text-to-video` | Versioned model |
| `/models/{model}/{capability}/{media-type}` | `/models/flashvsr/upscale/video` | With media type |
| `/models/{model}/{version}/{capability}/{media-type}` | `/models/topaz/upscale/video` | Full path |

---

## Authentication

### API Key Authentication

All requests require an API key in the Authorization header:

```http
Authorization: Key <YOUR_API_KEY>
```

Alternative: Query parameter (not recommended for production)
```
?api_key=<YOUR_API_KEY>
```

### Rate Limiting by Tier

| Tier | Requests/Min | Concurrent Jobs | Monthly Credits |
|------|--------------|-----------------|-----------------|
| Free | 10 | 2 | 100 |
| Pro | 60 | 10 | 1000 |
| Enterprise | Unlimited | 50 | Custom |

---

## Endpoint Categories

### 1. Video Processing & Enhancement

#### 1.1 FlashVSR - Fast Video Upscaling

**Endpoint**: `POST /api/v1/models/flashvsr/upscale/video`

**Description**: Real-time diffusion-based video super-resolution

**Request Body**:
```json
{
  "video_url": "https://example.com/input.mp4",
  "scale_factor": 2,
  "output_format": "mp4",
  "webhook_url": "https://example.com/webhook",
  "sync_mode": false
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `video_url` | string (URL) | Yes | - | URL of input video (mp4, mov, webm, m4v, gif) |
| `scale_factor` | integer | No | 2 | Upscaling factor (1-4) |
| `output_format` | string | No | "mp4" | Output format: mp4, mov, webm |
| `webhook_url` | string (URL) | No | null | Webhook for completion notification |
| `sync_mode` | boolean | No | false | Wait for completion before returning |

**Response** (Async):
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "request_id": "req_abc123",
  "status_url": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status",
  "response_url": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000",
  "cancel_url": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/cancel",
  "created_at": "2025-11-16T10:30:00Z"
}
```

**Pricing Model**: $0.0005 per megapixel (width × height × frames)

---

#### 1.2 RIFE - Frame Interpolation

##### 1.2.1 RIFE Image Interpolation

**Endpoint**: `POST /api/v1/models/rife/image`

**Description**: Interpolate frames between two images

**Request Body**:
```json
{
  "start_image_url": "https://example.com/start.jpg",
  "end_image_url": "https://example.com/end.jpg",
  "num_frames": 10,
  "fps": 24,
  "output_type": "video",
  "output_format": "mp4",
  "sync_mode": false
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_image_url` | string (URL) | Yes | - | URL of starting image |
| `end_image_url` | string (URL) | Yes | - | URL of ending image |
| `num_frames` | integer | No | 10 | Number of interpolated frames (1-120) |
| `fps` | integer | No | 24 | Frames per second (1-120) |
| `output_type` | string | No | "video" | "video" or "images" |
| `output_format` | string | No | "mp4" | "mp4", "mov", "webm", "jpeg", "png" |
| `sync_mode` | boolean | No | false | Synchronous mode |

##### 1.2.2 RIFE Video Interpolation

**Endpoint**: `POST /api/v1/models/rife/video`

**Description**: Interpolate frames in existing video for smooth slow-motion

**Request Body**:
```json
{
  "video_url": "https://example.com/input.mp4",
  "target_fps": 60,
  "num_frames": 2,
  "use_calculated_fps": false,
  "loop": false,
  "output_format": "mp4"
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `video_url` | string (URL) | Yes | - | URL of input video |
| `target_fps` | integer | No | 60 | Target FPS for output (8-120) |
| `num_frames` | integer | No | 2 | Number of frames to interpolate between each pair |
| `use_calculated_fps` | boolean | No | false | Auto-calculate optimal FPS |
| `loop` | boolean | No | false | Create seamless loop |
| `output_format` | string | No | "mp4" | Output format |

---

#### 1.3 Topaz Video AI - Professional Upscaling

**Endpoint**: `POST /api/v1/models/topaz/upscale/video`

**Description**: Professional-grade video upscaling with Topaz Video AI

**Request Body**:
```json
{
  "video_url": "https://example.com/input.mp4",
  "upscale_factor": 2,
  "target_resolution": "4K",
  "enable_interpolation": true,
  "target_fps": 60,
  "enhancement_model": "proteus-v4",
  "interpolation_model": "apollo-v8",
  "denoise_level": 0.5,
  "sharpen_level": 0.3
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `video_url` | string (URL) | Yes | - | URL of input video |
| `upscale_factor` | integer | No | 2 | Upscaling factor (1-8) |
| `target_resolution` | string | No | null | "1080p", "4K", "8K", "16K" |
| `enable_interpolation` | boolean | No | false | Enable frame interpolation |
| `target_fps` | integer | No | null | Target FPS (requires interpolation) |
| `enhancement_model` | string | No | "proteus-v4" | Enhancement model |
| `interpolation_model` | string | No | "apollo-v8" | Interpolation model |
| `denoise_level` | float | No | 0.5 | Denoise strength (0.0-1.0) |
| `sharpen_level` | float | No | 0.3 | Sharpening strength (0.0-1.0) |

---

#### 1.4 SeedVR - High-Quality Video Upscaling

**Endpoint**: `POST /api/v1/models/seedvr/upscale/video`

**Description**: Exceptional quality video upscaling with fine texture enhancement

**Request Body**:
```json
{
  "video_url": "https://example.com/input.mp4",
  "upscale_factor": 2,
  "preserve_texture": true,
  "color_correction": "auto"
}
```

---

#### 1.5 Generic Video Upscaler

**Endpoint**: `POST /api/v1/models/video-upscaler/upscale`

**Description**: General-purpose video upscaling

**Request Body**:
```json
{
  "video_url": "https://example.com/input.mp4",
  "scale": 2,
  "model": "auto"
}
```

---

### 2. Text-to-Video Models

#### 2.1 Veo (Google)

##### 2.1.1 Veo 2

**Endpoint**: `POST /api/v1/models/veo/2/text-to-video`

##### 2.1.2 Veo 3

**Endpoint**: `POST /api/v1/models/veo/3/text-to-video`

##### 2.1.3 Veo 3.1 (Fastest)

**Endpoint**: `POST /api/v1/models/veo/3.1/text-to-video`

**Description**: Google's most advanced video generation with fastest performance

**Request Body**:
```json
{
  "prompt": "A serene sunset over mountains with flying birds",
  "negative_prompt": "blurry, distorted, low quality",
  "duration": 5,
  "aspect_ratio": "16:9",
  "fps": 24,
  "seed": 42,
  "guidance_scale": 7.5,
  "num_inference_steps": 50
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Text description of desired video |
| `negative_prompt` | string | No | "" | What to avoid in generation |
| `duration` | integer | No | 5 | Video duration in seconds (1-10) |
| `aspect_ratio` | string | No | "16:9" | "16:9", "9:16", "1:1", "4:3" |
| `fps` | integer | No | 24 | Frames per second (8-30) |
| `seed` | integer | No | random | Random seed for reproducibility |
| `guidance_scale` | float | No | 7.5 | Prompt adherence (1.0-20.0) |
| `num_inference_steps` | integer | No | 50 | Generation steps (10-100) |

---

#### 2.2 MiniMax Hailuo

##### 2.2.1 Hailuo 01 Live

**Endpoint**: `POST /api/v1/models/hailuo/01/text-to-video`

##### 2.2.2 Hailuo 02 Standard

**Endpoint**: `POST /api/v1/models/hailuo/02/text-to-video`

**Request Body**:
```json
{
  "prompt": "A cat playing piano",
  "resolution": "standard",
  "duration": 6
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Video description |
| `resolution` | string | No | "standard" | "standard", "768p", "512p" |
| `duration` | integer | No | 6 | Duration in seconds (1-10) |

---

#### 2.3 Kling AI

##### 2.3.1 Kling 1.6

**Endpoint**: `POST /api/v1/models/kling/1.6/text-to-video`

##### 2.3.2 Kling 2.1 Pro

**Endpoint**: `POST /api/v1/models/kling/2.1/pro/text-to-video`

##### 2.3.3 Kling 2.5 Turbo Pro

**Endpoint**: `POST /api/v1/models/kling/2.5/turbo-pro/text-to-video`

**Description**: Top-tier video generation with enhanced motion fluidity

**Request Body**:
```json
{
  "prompt": "Dynamic cityscape at night with moving traffic",
  "mode": "pro",
  "duration": 5,
  "camera_movement": "smooth_pan"
}
```

---

#### 2.4 Mochi

**Endpoint**: `POST /api/v1/models/mochi/text-to-video`

**Request Body**:
```json
{
  "prompt": "Animated character walking through forest",
  "style": "anime",
  "duration": 4
}
```

---

#### 2.5 Hunyuan Video

**Endpoint**: `POST /api/v1/models/hunyuan/text-to-video`

---

#### 2.6 Luma Dream Machine

**Endpoint**: `POST /api/v1/models/luma-dream-machine/text-to-video`

**Request Body**:
```json
{
  "prompt": "Surreal landscape with floating islands",
  "creativity": 0.8,
  "duration": 5
}
```

---

#### 2.7 PixVerse

**Endpoint**: `POST /api/v1/models/pixverse/text-to-video`

---

#### 2.8 LTX Video

**Endpoint**: `POST /api/v1/models/ltx-video/text-to-video`

---

#### 2.9 Stable Video Diffusion

**Endpoint**: `POST /api/v1/models/stable-video/text-to-video`

---

#### 2.10 Wan 2.5

**Endpoint**: `POST /api/v1/models/wan/2.5/text-to-video`

**Request Body**:
```json
{
  "prompt": "Ocean waves crashing on beach",
  "duration": 5,
  "fps": 24
}
```

---

### 3. Image-to-Video Models

#### 3.1 Veo Image-to-Video

##### 3.1.1 Veo 2 I2V

**Endpoint**: `POST /api/v1/models/veo/2/image-to-video`

##### 3.1.2 Veo 3.1 Fast I2V

**Endpoint**: `POST /api/v1/models/veo/3.1/fast/image-to-video`

**Description**: Fast image-to-video with realistic motion

**Request Body**:
```json
{
  "image_url": "https://example.com/input.jpg",
  "prompt": "Make the person wave and smile",
  "duration": 3,
  "motion_intensity": 0.7,
  "fps": 24
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string (URL) | Yes | - | Input image URL |
| `prompt` | string | No | "" | Motion description |
| `duration` | integer | No | 3 | Video duration (1-10 sec) |
| `motion_intensity` | float | No | 0.5 | Motion strength (0.0-1.0) |
| `fps` | integer | No | 24 | Frames per second |

---

#### 3.2 Kling Image-to-Video

##### 3.2.1 Kling 2.1 Master I2V

**Endpoint**: `POST /api/v1/models/kling/2.1/master/image-to-video`

##### 3.2.2 Kling 2.5 Turbo Pro I2V

**Endpoint**: `POST /api/v1/models/kling/2.5/turbo-pro/image-to-video`

---

#### 3.3 MiniMax Hailuo I2V

##### 3.3.1 Hailuo-02 Standard I2V

**Endpoint**: `POST /api/v1/models/hailuo/02/standard/image-to-video`

##### 3.3.2 Hailuo-02 768p I2V

**Endpoint**: `POST /api/v1/models/hailuo/02/768p/image-to-video`

##### 3.3.3 Hailuo-02 512p I2V

**Endpoint**: `POST /api/v1/models/hailuo/02/512p/image-to-video`

---

#### 3.4 Wan Pro

**Endpoint**: `POST /api/v1/models/wan/pro/image-to-video`

**Description**: Transform static images into dynamic videos

**Request Body**:
```json
{
  "image_url": "https://example.com/portrait.jpg",
  "motion_prompt": "Natural breathing and subtle movements",
  "duration": 4
}
```

---

#### 3.5 Framepack

**Endpoint**: `POST /api/v1/models/framepack/image-to-video`

**Description**: Efficient autoregressive image-to-video generation

**Request Body**:
```json
{
  "image_url": "https://example.com/scene.jpg",
  "frames": 60,
  "fps": 24
}
```

---

#### 3.6 Stable Video I2V

**Endpoint**: `POST /api/v1/models/stable-video/image-to-video`

---

### 4. Specialized Video Models

#### 4.1 MultiTalk - Talking Avatar

**Endpoint**: `POST /api/v1/models/multitalk/generate`

**Description**: Generate talking avatar video from image and text with automatic text-to-speech

**Request Body**:
```json
{
  "image_url": "https://example.com/portrait.jpg",
  "text": "Hello, welcome to our presentation",
  "voice": "en-US-female-1",
  "emotion": "happy",
  "audio_url": "https://example.com/speech.mp3"
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string (URL) | Yes | - | Portrait image URL |
| `text` | string | Conditional | - | Text to convert to speech (required if no audio_url) |
| `audio_url` | string (URL) | Conditional | - | Pre-recorded audio (required if no text) |
| `voice` | string | No | "en-US-female-1" | Voice ID for TTS |
| `emotion` | string | No | "neutral" | "neutral", "happy", "sad", "angry" |
| `lip_sync_quality` | string | No | "high" | "low", "medium", "high" |

---

#### 4.2 Omnihuman v1.5

**Endpoint**: `POST /api/v1/models/omnihuman/1.5/generate`

**Description**: Generate video from human image + audio with realistic animation

**Request Body**:
```json
{
  "image_url": "https://example.com/person.jpg",
  "audio_url": "https://example.com/speech.mp3",
  "background": "preserve",
  "body_animation": true
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string (URL) | Yes | - | Human figure image |
| `audio_url` | string (URL) | Yes | - | Audio file URL |
| `background` | string | No | "preserve" | "preserve", "remove", "blur" |
| `body_animation` | boolean | No | true | Enable body gestures |

---

#### 4.3 Sync Lipsync 2.0

**Endpoint**: `POST /api/v1/models/sync-lipsync/2.0/generate`

**Description**: Realistic lip-sync for existing videos

**Request Body**:
```json
{
  "video_url": "https://example.com/video.mp4",
  "audio_url": "https://example.com/new-audio.mp3",
  "sync_accuracy": "high"
}
```

---

#### 4.4 PixVerse Lipsync

**Endpoint**: `POST /api/v1/models/pixverse/lipsync/generate`

---

#### 4.5 Kling AI Avatar Pro

**Endpoint**: `POST /api/v1/models/kling/avatar-pro/generate`

**Description**: Create avatar videos with realistic humans, animals, or stylized characters

**Request Body**:
```json
{
  "image_url": "https://example.com/character.jpg",
  "audio_url": "https://example.com/voice.mp3",
  "avatar_type": "human",
  "animation_style": "realistic"
}
```

**Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_url` | string (URL) | Yes | - | Character image |
| `audio_url` | string (URL) | Yes | - | Voice audio |
| `avatar_type` | string | No | "human" | "human", "animal", "cartoon", "stylized" |
| `animation_style` | string | No | "realistic" | "realistic", "expressive", "subtle" |

---

## Request/Response Format

### Standard Request Structure

All endpoints accept JSON requests with the following common fields:

```json
{
  // Model-specific parameters
  "param1": "value1",

  // Optional common parameters
  "webhook_url": "https://example.com/webhook",
  "sync_mode": false,
  "priority": "normal",
  "idempotency_key": "unique-request-id"
}
```

### Common Request Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `webhook_url` | string | URL to receive completion notification |
| `sync_mode` | boolean | Wait for completion (blocks request) |
| `priority` | string | "low", "normal", "high" |
| `idempotency_key` | string | Unique ID for idempotent requests |

### Async Response (Default)

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "request_id": "req_abc123",
  "created_at": "2025-11-16T10:30:00Z",
  "urls": {
    "status": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status",
    "result": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000",
    "cancel": "/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/cancel"
  }
}
```

### Job Status Response

**Endpoint**: `GET /api/v1/jobs/{job_id}/status`

**Queued**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "position": 3,
  "created_at": "2025-11-16T10:30:00Z",
  "estimated_wait": "2 minutes"
}
```

**Processing**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 45,
  "current_step": "rendering_frames",
  "created_at": "2025-11-16T10:30:00Z",
  "started_at": "2025-11-16T10:32:00Z",
  "estimated_completion": "2025-11-16T10:35:00Z"
}
```

**Completed**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "created_at": "2025-11-16T10:30:00Z",
  "started_at": "2025-11-16T10:32:00Z",
  "completed_at": "2025-11-16T10:34:30Z",
  "duration_ms": 150000,
  "result": {
    "video_url": "https://storage.example.com/outputs/result.mp4",
    "thumbnail_url": "https://storage.example.com/outputs/thumb.jpg",
    "metadata": {
      "duration": 5.2,
      "resolution": "1920x1080",
      "fps": 24,
      "size_bytes": 15728640,
      "format": "mp4"
    }
  }
}
```

**Failed**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Video processing failed: Invalid input format",
    "details": "The input video codec is not supported"
  },
  "created_at": "2025-11-16T10:30:00Z",
  "started_at": "2025-11-16T10:32:00Z",
  "failed_at": "2025-11-16T10:33:15Z"
}
```

### Sync Response (sync_mode=true)

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "video_url": "https://storage.example.com/outputs/result.mp4",
    "thumbnail_url": "https://storage.example.com/outputs/thumb.jpg",
    "metadata": {
      "duration": 5.2,
      "resolution": "1920x1080",
      "fps": 24,
      "size_bytes": 15728640
    }
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context about the error",
    "request_id": "req_abc123"
  }
}
```

### Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request or invalid parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 402 | `INSUFFICIENT_CREDITS` | Not enough credits for operation |
| 403 | `FORBIDDEN` | Operation not allowed for this user |
| 404 | `NOT_FOUND` | Resource (job, model) not found |
| 409 | `CONFLICT` | Duplicate idempotency key |
| 413 | `PAYLOAD_TOO_LARGE` | Input file too large |
| 422 | `VALIDATION_ERROR` | Parameter validation failed |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |
| 504 | `TIMEOUT` | Request timeout |

### Example Error Responses

**Invalid Parameters**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Parameter validation failed",
    "details": {
      "video_url": "Must be a valid URL",
      "fps": "Must be between 8 and 120"
    },
    "request_id": "req_abc123"
  }
}
```

**Rate Limit**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": "You have exceeded 60 requests per minute",
    "retry_after": 45,
    "request_id": "req_abc123"
  }
}
```

---

## Rate Limiting

### Headers

All responses include rate limit headers:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1636972800
X-RateLimit-Resource: job-creation
```

### Limits by Resource Type

| Resource | Free Tier | Pro Tier | Enterprise |
|----------|-----------|----------|------------|
| Job Creation | 10/min | 60/min | Unlimited |
| Status Checks | 100/min | 500/min | Unlimited |
| Concurrent Jobs | 2 | 10 | 50 |

---

## Webhook Support

### Webhook Registration

**Endpoint**: `POST /api/v1/webhooks/register`

**Request**:
```json
{
  "url": "https://example.com/webhook",
  "events": ["job.completed", "job.failed"],
  "secret": "webhook_secret_key"
}
```

**Response**:
```json
{
  "webhook_id": "wh_abc123",
  "url": "https://example.com/webhook",
  "events": ["job.completed", "job.failed"],
  "created_at": "2025-11-16T10:30:00Z"
}
```

### Webhook Payload

**Event**: `job.completed`

```json
{
  "event": "job.completed",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-16T10:34:30Z",
  "data": {
    "status": "completed",
    "result": {
      "video_url": "https://storage.example.com/outputs/result.mp4",
      "metadata": {...}
    }
  }
}
```

### Webhook Security

Webhooks include a signature header for verification:

```http
X-Webhook-Signature: sha256=abc123...
X-Webhook-ID: wh_abc123
X-Webhook-Timestamp: 1636972800
```

---

## WebSocket/SSE Streaming

### WebSocket Connection

**Endpoint**: `ws://api.example.com/api/v1/jobs/{job_id}/stream`

**Authentication**:
```javascript
ws://api.example.com/api/v1/jobs/550e8400.../stream?api_key=YOUR_KEY
```

**Events**:
```json
{
  "type": "progress",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 45,
  "step": "rendering_frames",
  "timestamp": "2025-11-16T10:33:00Z"
}
```

```json
{
  "type": "completed",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "result": {...}
}
```

### Server-Sent Events (SSE)

**Endpoint**: `GET /api/v1/jobs/{job_id}/stream`

**Headers**:
```http
Accept: text/event-stream
Authorization: Key YOUR_API_KEY
```

**Stream Format**:
```
event: progress
data: {"progress": 45, "step": "rendering_frames"}

event: completed
data: {"status": "completed", "result": {...}}
```

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Set up base API route structure
- [ ] Implement authentication middleware
- [ ] Create job queue system enhancements
- [ ] Develop common request/response handlers
- [ ] Set up error handling framework

### Phase 2: Video Processing Models (Week 3-4)
- [ ] Implement FlashVSR endpoint + ComfyUI workflow
- [ ] Implement RIFE (image & video) endpoints + workflows
- [ ] Implement Topaz Video upscaling endpoint + workflow
- [ ] Implement SeedVR endpoint + workflow
- [ ] Testing and optimization

### Phase 3: Text-to-Video Models (Week 5-7)
- [ ] Implement Veo family endpoints (2, 3, 3.1)
- [ ] Implement MiniMax Hailuo endpoints
- [ ] Implement Kling AI endpoints (1.6, 2.1, 2.5)
- [ ] Implement Mochi, Hunyuan, LTX, PixVerse
- [ ] Implement Stable Video Diffusion
- [ ] Implement Wan 2.5

### Phase 4: Image-to-Video Models (Week 8-9)
- [ ] Implement all Veo I2V variants
- [ ] Implement Kling I2V variants
- [ ] Implement Hailuo I2V variants
- [ ] Implement Wan Pro, Framepack
- [ ] Implement Stable Video I2V

### Phase 5: Specialized Models (Week 10-11)
- [ ] Implement MultiTalk endpoint + workflow
- [ ] Implement Omnihuman endpoint + workflow
- [ ] Implement lipsync models (Sync, PixVerse)
- [ ] Implement Kling Avatar Pro

### Phase 6: Advanced Features (Week 12)
- [ ] Implement webhook system
- [ ] Implement WebSocket/SSE streaming
- [ ] Add idempotency support
- [ ] Implement rate limiting
- [ ] Performance optimization

### Phase 7: Documentation & Testing (Week 13-14)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] SDK development (Python, JavaScript)
- [ ] Comprehensive testing
- [ ] Load testing
- [ ] Security audit

---

## Directory Structure

```
backend/src/
├── routes/
│   └── models/
│       ├── index.js                    # Main models router
│       ├── video-processing/
│       │   ├── flashvsr.js            # FlashVSR routes
│       │   ├── rife.js                # RIFE routes
│       │   ├── topaz.js               # Topaz routes
│       │   └── seedvr.js              # SeedVR routes
│       ├── text-to-video/
│       │   ├── veo.js                 # Veo family routes
│       │   ├── hailuo.js              # MiniMax routes
│       │   ├── kling.js               # Kling routes
│       │   └── ...
│       ├── image-to-video/
│       │   └── ...
│       └── specialized/
│           ├── multitalk.js
│           ├── omnihuman.js
│           └── lipsync.js
├── services/
│   ├── models/
│   │   ├── videoProcessingService.js  # Video processing logic
│   │   ├── textToVideoService.js      # T2V logic
│   │   ├── imageToVideoService.js     # I2V logic
│   │   └── specializedService.js      # Specialized models logic
│   ├── workflowManager.js             # ComfyUI workflow management
│   └── parameterMapper.js             # Map API params to workflow params
├── validators/
│   ├── models/
│   │   ├── flashvsrValidator.js
│   │   ├── rifeValidator.js
│   │   └── ...
│   └── commonValidator.js
└── workflows/
    ├── flashvsr-upscale.json
    ├── rife-interpolation.json
    ├── veo-text-to-video.json
    └── ...
```

---

## ComfyUI Workflow Integration

### Workflow Template Structure

Each model endpoint maps to a ComfyUI workflow JSON with parameter placeholders:

```json
{
  "workflow_name": "flashvsr_upscale",
  "description": "FlashVSR video upscaling",
  "parameters": {
    "video_path": "{{video_path}}",
    "scale_factor": "{{scale_factor}}",
    "output_path": "{{output_path}}"
  },
  "nodes": {
    "1": {
      "class_type": "LoadVideo",
      "inputs": {
        "video": "{{video_path}}"
      }
    },
    "2": {
      "class_type": "FlashVSRUpscale",
      "inputs": {
        "video": ["1", 0],
        "scale": "{{scale_factor}}"
      }
    },
    "3": {
      "class_type": "SaveVideo",
      "inputs": {
        "video": ["2", 0],
        "filename_prefix": "{{output_path}}"
      }
    }
  }
}
```

### Parameter Mapping

API parameters → ComfyUI workflow parameters:

```javascript
// Example: FlashVSR
const apiRequest = {
  video_url: "https://example.com/input.mp4",
  scale_factor: 2
};

// Maps to workflow parameters
const workflowParams = {
  video_path: "/tmp/downloaded_input.mp4",
  scale_factor: 2,
  output_path: "flashvsr_output"
};
```

### Workflow Execution Flow

1. **Request received** → Validate parameters
2. **Download input media** → Store temporarily
3. **Map parameters** → Substitute workflow placeholders
4. **Create job** → Add to queue
5. **Execute workflow** → Via ComfyUI client
6. **Monitor progress** → WebSocket events
7. **Upload result** → To media storage
8. **Return response** → Job status/result

---

## Configuration

### Environment Variables

```bash
# API Configuration
API_VERSION=v1
API_BASE_PATH=/api
PORT=3000

# Authentication
API_KEY_HEADER=Authorization
API_KEY_PREFIX=Key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_MAX_JOBS=10

# Job Processing
MAX_CONCURRENT_JOBS=10
JOB_TIMEOUT_MS=1800000
JOB_POLL_INTERVAL_MS=2000

# Storage
MEDIA_STORAGE_PATH=/app/output
MEDIA_BASE_URL=https://storage.example.com

# ComfyUI
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_WS_URL=ws://localhost:8188/ws

# Webhooks
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_ATTEMPTS=3

# Pricing (per megapixel)
FLASHVSR_PRICE_PER_MP=0.0005
TOPAZ_PRICE_PER_MP=0.001
```

---

## Security Considerations

1. **Input Validation**: Strict validation of all URL inputs and file types
2. **File Size Limits**: Maximum file sizes per model type
3. **URL Whitelisting**: Optional whitelist for input URL domains
4. **Sandboxing**: ComfyUI execution in isolated containers
5. **Rate Limiting**: Multi-tier rate limiting (IP, API key, user)
6. **CORS**: Configurable CORS policies
7. **API Key Rotation**: Support for key rotation and expiration
8. **Webhook Signatures**: HMAC signatures for webhook verification
9. **SSL/TLS**: HTTPS required for all production endpoints
10. **Audit Logging**: Comprehensive logging of all API requests

---

## Monitoring & Analytics

### Metrics to Track

- **Request Metrics**: Count, latency, error rate per endpoint
- **Job Metrics**: Queue length, processing time, success/failure rates
- **Resource Metrics**: CPU, memory, GPU utilization
- **Cost Metrics**: Credit usage, pricing per model
- **User Metrics**: Active users, API key usage patterns

### Logging

All requests logged with:
- Request ID
- User/API key
- Endpoint
- Parameters (sanitized)
- Response status
- Processing time
- Error details (if applicable)

---

## Testing Strategy

### Unit Tests
- Parameter validation
- Error handling
- Workflow parameter mapping

### Integration Tests
- End-to-end API requests
- ComfyUI workflow execution
- Webhook delivery
- WebSocket streaming

### Load Tests
- Concurrent request handling
- Job queue performance
- Rate limiting behavior

### Security Tests
- Authentication bypass attempts
- Input injection attacks
- Rate limit evasion

---

## Migration from Existing Endpoints

### Existing WAN Endpoints

Current:
```
POST /api/v1/wan/2.2/text-to-video-turbo
POST /api/v1/wan/2.5/text-to-video
```

New (compatible):
```
POST /api/v1/models/wan/2.2/text-to-video-turbo
POST /api/v1/models/wan/2.5/text-to-video
```

**Strategy**:
- Keep existing endpoints for backward compatibility
- Redirect to new endpoints internally
- Deprecation notice in response headers
- 6-month migration period

---

## API Versioning Strategy

### URL Versioning
- Current: `/api/v1/...`
- Future: `/api/v2/...`

### Breaking Changes Policy
1. Announce breaking changes 3 months in advance
2. Maintain previous version for 6 months minimum
3. Provide migration guides
4. Offer version negotiation via header: `API-Version: 1.0`

---

## OpenAPI/Swagger Specification

Generate OpenAPI 3.0 specification for:
- Interactive documentation
- SDK generation
- API testing tools
- Client library generation

Location: `/api/v1/openapi.json` or `/api/v1/swagger.json`

---

## Appendix

### A. Complete Endpoint List

```
Video Processing (5 endpoints):
├── POST /api/v1/models/flashvsr/upscale/video
├── POST /api/v1/models/rife/image
├── POST /api/v1/models/rife/video
├── POST /api/v1/models/topaz/upscale/video
└── POST /api/v1/models/seedvr/upscale/video

Text-to-Video (17 endpoints):
├── POST /api/v1/models/veo/2/text-to-video
├── POST /api/v1/models/veo/3/text-to-video
├── POST /api/v1/models/veo/3.1/text-to-video
├── POST /api/v1/models/hailuo/01/text-to-video
├── POST /api/v1/models/hailuo/02/text-to-video
├── POST /api/v1/models/kling/1.6/text-to-video
├── POST /api/v1/models/kling/2.1/pro/text-to-video
├── POST /api/v1/models/kling/2.5/turbo-pro/text-to-video
├── POST /api/v1/models/mochi/text-to-video
├── POST /api/v1/models/hunyuan/text-to-video
├── POST /api/v1/models/luma-dream-machine/text-to-video
├── POST /api/v1/models/pixverse/text-to-video
├── POST /api/v1/models/ltx-video/text-to-video
├── POST /api/v1/models/stable-video/text-to-video
└── POST /api/v1/models/wan/2.5/text-to-video

Image-to-Video (9 endpoints):
├── POST /api/v1/models/veo/2/image-to-video
├── POST /api/v1/models/veo/3.1/fast/image-to-video
├── POST /api/v1/models/kling/2.1/master/image-to-video
├── POST /api/v1/models/kling/2.5/turbo-pro/image-to-video
├── POST /api/v1/models/hailuo/02/standard/image-to-video
├── POST /api/v1/models/hailuo/02/768p/image-to-video
├── POST /api/v1/models/hailuo/02/512p/image-to-video
├── POST /api/v1/models/wan/pro/image-to-video
├── POST /api/v1/models/framepack/image-to-video
└── POST /api/v1/models/stable-video/image-to-video

Specialized (5 endpoints):
├── POST /api/v1/models/multitalk/generate
├── POST /api/v1/models/omnihuman/1.5/generate
├── POST /api/v1/models/sync-lipsync/2.0/generate
├── POST /api/v1/models/pixverse/lipsync/generate
└── POST /api/v1/models/kling/avatar-pro/generate

Total: 36 model endpoints
```

### B. Pricing Calculator

Example pricing calculation for FlashVSR:

```
Input: 1080p video, 5 seconds, 24fps
Frames: 5 × 24 = 120 frames
Resolution: 1920 × 1080 = 2,073,600 pixels
Megapixels: 2.0736 MP
Total MP: 2.0736 × 120 = 248.832 MP
Cost: 248.832 × $0.0005 = $0.124416 ≈ $0.12
```

### C. Model Capability Matrix

| Model | Input Type | Output Type | Max Duration | Max Resolution | Avg Processing Time |
|-------|------------|-------------|--------------|----------------|---------------------|
| FlashVSR | Video | Video | 60s | 4K | 2x duration |
| RIFE | Image/Video | Video | 30s | 4K | 1x duration |
| Topaz | Video | Video | 300s | 16K | 5x duration |
| Veo 3.1 | Text | Video | 10s | 1080p | 120s |
| Kling 2.5 | Text/Image | Video | 10s | 1080p | 90s |
| MultiTalk | Image+Text | Video | 60s | 1080p | 30s |

---

**Document End**

For questions or clarification, please contact the API development team.
