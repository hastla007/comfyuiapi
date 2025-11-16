# ComfyUI API Architecture Design

## Overview

This document outlines the API architecture for ComfyUI workflows compatible with kie.ai and WaveSpeed.ai endpoints. The API supports video generation models including WAN 2.2, WAN 2.5, and Infinitetalk variants.

## Design Principles

1. **kie.ai/WaveSpeed.ai Compatible**: API structure mirrors these platforms for easy migration
2. **Async Processing**: All generation requests are asynchronous with job tracking
3. **RESTful Design**: Standard HTTP methods and status codes
4. **ComfyUI Integration**: Workflows are mapped to model types
5. **Extensible**: Easy to add new model types and workflows

## Base URL Structure

```
Base API URL: /api/v1
```

## Authentication

### API Key Authentication
```
Authorization: Bearer {API_KEY}
```

All endpoints require API key authentication via Bearer token in the Authorization header.

## Model Types & Endpoints

### 1. WAN 2.2 Models

#### 1.1 Text-to-Video Turbo
```
POST /api/v1/wan/2.2/text-to-video-turbo
```

**Request Body:**
```json
{
  "prompt": "string (required, max 800 chars)",
  "resolution": "480p | 580p | 720p (default: 720p)",
  "aspect_ratio": "16:9 | 9:16 | 1:1 (default: 16:9)",
  "duration": "number (seconds, default: 5, max: 10)",
  "seed": "number (optional, -1 for random)",
  "negative_prompt": "string (optional)",
  "workflow_id": "number (optional, uses default if not specified)",
  "callback_url": "string (optional, webhook for completion)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "wan-2.2-text-to-video-turbo",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 1.2 Image-to-Video Turbo
```
POST /api/v1/wan/2.2/image-to-video-turbo
```

**Request Body:**
```json
{
  "image_url": "string (required, URL to input image)",
  "image_base64": "string (alternative to image_url)",
  "prompt": "string (optional, motion description)",
  "resolution": "480p | 580p | 720p (default: 720p)",
  "aspect_ratio": "16:9 | 9:16 | 1:1 (default: 16:9)",
  "duration": "number (seconds, default: 5, max: 10)",
  "seed": "number (optional, -1 for random)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "wan-2.2-image-to-video-turbo",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

### 2. WAN 2.5 Models

#### 2.1 Text-to-Video
```
POST /api/v1/wan/2.5/text-to-video
```

**Request Body:**
```json
{
  "prompt": "string (required, max 800 chars, supports Chinese & English)",
  "resolution": "720p | 1080p (default: 720p)",
  "aspect_ratio": "16:9 | 9:16 | 1:1 (default: 16:9)",
  "duration": "number (seconds, default: 5, max: 10)",
  "fps": "number (default: 24)",
  "seed": "number (optional, -1 for random)",
  "negative_prompt": "string (optional)",
  "audio_sync": "boolean (default: true, native audio generation)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "wan-2.5-text-to-video",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 2.2 Image-to-Video
```
POST /api/v1/wan/2.5/image-to-video
```

**Request Body:**
```json
{
  "image_url": "string (required, URL to input image)",
  "image_base64": "string (alternative to image_url)",
  "prompt": "string (optional, motion description, max 800 chars)",
  "resolution": "720p | 1080p (default: 720p)",
  "aspect_ratio": "16:9 | 9:16 | 1:1 (default: 16:9)",
  "duration": "number (seconds, default: 5, max: 10)",
  "fps": "number (default: 24)",
  "seed": "number (optional, -1 for random)",
  "audio_sync": "boolean (default: true)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "wan-2.5-image-to-video",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

### 3. Infinitetalk Models

#### 3.1 Infinitetalk (Image-to-Video with Audio)
```
POST /api/v1/infinitetalk
```

**Request Body:**
```json
{
  "image_url": "string (required, URL to input image)",
  "image_base64": "string (alternative to image_url)",
  "audio_url": "string (required, URL to audio file)",
  "audio_base64": "string (alternative to audio_url)",
  "resolution": "480p | 720p (default: 720p)",
  "seed": "number (optional, -1 for random)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 3.2 Infinitetalk Fast
```
POST /api/v1/infinitetalk/fast
```

**Request Body:**
```json
{
  "image_url": "string (required)",
  "image_base64": "string (alternative to image_url)",
  "audio_url": "string (required)",
  "audio_base64": "string (alternative to audio_url)",
  "resolution": "480p | 720p (default: 480p)",
  "seed": "number (optional, -1 for random)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk-fast",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 3.3 Infinitetalk Multi
```
POST /api/v1/infinitetalk/multi
```

**Request Body:**
```json
{
  "image_url": "string (required)",
  "image_base64": "string (alternative to image_url)",
  "audio_url_1": "string (required, first audio track)",
  "audio_base64_1": "string (alternative to audio_url_1)",
  "audio_url_2": "string (required, second audio track)",
  "audio_base64_2": "string (alternative to audio_url_2)",
  "order": "meanwhile | sequential (default: meanwhile)",
  "resolution": "480p | 720p (default: 720p)",
  "seed": "number (optional, -1 for random)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk-multi",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 3.4 Infinitetalk Fast Multi
```
POST /api/v1/infinitetalk/fast-multi
```

**Request Body:** Same as Infinitetalk Multi with faster processing

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk-fast-multi",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 3.5 Infinitetalk Video-to-Video
```
POST /api/v1/infinitetalk/video-to-video
```

**Request Body:**
```json
{
  "video_url": "string (required, URL to input video)",
  "video_base64": "string (alternative to video_url)",
  "audio_url": "string (required)",
  "audio_base64": "string (alternative to audio_url)",
  "prompt": "string (optional, transformation description)",
  "resolution": "480p | 720p (default: 720p)",
  "seed": "number (optional, -1 for random)",
  "workflow_id": "number (optional)",
  "callback_url": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk-video-to-video",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

#### 3.6 Infinitetalk Fast Video-to-Video
```
POST /api/v1/infinitetalk/fast-video-to-video
```

**Request Body:** Same as Infinitetalk Video-to-Video with faster processing

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "infinitetalk-fast-video-to-video",
  "created_at": "ISO8601 timestamp",
  "estimated_time": "number (seconds)"
}
```

## Job Management Endpoints

### Get Job Status
```
GET /api/v1/jobs/{job_id}
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "queued | processing | completed | failed",
  "model": "string",
  "progress": "number (0-100)",
  "created_at": "ISO8601 timestamp",
  "started_at": "ISO8601 timestamp (nullable)",
  "completed_at": "ISO8601 timestamp (nullable)",
  "result": {
    "video_url": "string (available when status=completed)",
    "thumbnail_url": "string (optional)",
    "duration": "number (seconds)",
    "resolution": "string",
    "file_size": "number (bytes)"
  },
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

### Get Job Result
```
GET /api/v1/jobs/{job_id}/result
```

**Response:**
```json
{
  "success": true,
  "job_id": "string (UUID)",
  "status": "completed",
  "result": {
    "video_url": "string",
    "thumbnail_url": "string (optional)",
    "duration": "number (seconds)",
    "resolution": "string",
    "file_size": "number (bytes)",
    "metadata": {
      "prompt": "string (optional)",
      "seed": "number",
      "model": "string"
    }
  }
}
```

### Cancel Job
```
DELETE /api/v1/jobs/{job_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

### List Jobs
```
GET /api/v1/jobs?status={status}&limit={limit}&offset={offset}
```

**Query Parameters:**
- `status`: (optional) Filter by status: `queued`, `processing`, `completed`, `failed`
- `limit`: (optional) Number of results (default: 50, max: 100)
- `offset`: (optional) Pagination offset (default: 0)
- `model`: (optional) Filter by model type

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "job_id": "string (UUID)",
      "status": "string",
      "model": "string",
      "created_at": "ISO8601 timestamp",
      "completed_at": "ISO8601 timestamp (nullable)"
    }
  ],
  "total": "number",
  "limit": "number",
  "offset": "number"
}
```

## Webhook/Callback System

When `callback_url` is provided in the request, the API will POST to that URL when the job completes or fails.

### Callback Payload
```json
{
  "job_id": "string (UUID)",
  "status": "completed | failed",
  "model": "string",
  "completed_at": "ISO8601 timestamp",
  "result": {
    "video_url": "string",
    "thumbnail_url": "string (optional)",
    "duration": "number (seconds)",
    "resolution": "string",
    "file_size": "number (bytes)"
  },
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

### Callback Security
- Callbacks include `X-Signature` header with HMAC-SHA256 signature
- Signature calculated using API key as secret
- Payload: `{job_id}:{status}:{timestamp}`

## Error Responses

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string",
    "details": "object (optional)"
  }
}
```

### Error Codes

- `invalid_request`: Missing or invalid parameters
- `authentication_failed`: Invalid or missing API key
- `rate_limit_exceeded`: Too many requests
- `workflow_not_found`: Specified workflow ID doesn't exist
- `processing_failed`: Job processing failed
- `insufficient_credits`: Not enough credits (if billing enabled)
- `invalid_media_url`: Media URL is inaccessible or invalid format
- `invalid_media_format`: Unsupported media format
- `job_not_found`: Job ID doesn't exist
- `job_expired`: Job result has expired
- `internal_error`: Server error

## HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Job created successfully
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

## Database Schema Updates

### Jobs Table
```sql
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  job_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id),
  workflow_id INTEGER REFERENCES workflows(id),
  model VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  request_payload JSONB NOT NULL,
  result JSONB,
  error JSONB,
  callback_url TEXT,
  callback_attempts INTEGER DEFAULT 0,
  callback_last_attempt TIMESTAMP,
  comfyui_prompt_id VARCHAR(255),
  container_id VARCHAR(64) REFERENCES containers(container_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP,
  INDEX idx_job_id (job_id),
  INDEX idx_status (status),
  INDEX idx_model (model),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);
```

### API Keys Table
```sql
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  permissions JSONB,
  rate_limit INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  INDEX idx_key_hash (key_hash),
  INDEX idx_user_id (user_id)
);
```

### Users Table (if not exists)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Model Workflows Mapping Table
```sql
CREATE TABLE model_workflows (
  id SERIAL PRIMARY KEY,
  model VARCHAR(100) UNIQUE NOT NULL,
  workflow_id INTEGER REFERENCES workflows(id),
  is_default BOOLEAN DEFAULT false,
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_model (model)
);
```

## Workflow Mapping

Each model type is mapped to a specific ComfyUI workflow:

| Model | Workflow File | Description |
|-------|--------------|-------------|
| wan-2.2-text-to-video-turbo | `wan_22_t2v_turbo.json` | WAN 2.2 Text-to-Video |
| wan-2.2-image-to-video-turbo | `wan_22_i2v_turbo.json` | WAN 2.2 Image-to-Video |
| wan-2.5-text-to-video | `wan_25_t2v.json` | WAN 2.5 Text-to-Video |
| wan-2.5-image-to-video | `wan_25_i2v.json` | WAN 2.5 Image-to-Video |
| infinitetalk | `infinitetalk.json` | Infinitetalk Base |
| infinitetalk-fast | `infinitetalk_fast.json` | Infinitetalk Fast |
| infinitetalk-multi | `infinitetalk_multi.json` | Infinitetalk Multi Audio |
| infinitetalk-fast-multi | `infinitetalk_fast_multi.json` | Infinitetalk Fast Multi |
| infinitetalk-video-to-video | `infinitetalk_v2v.json` | Infinitetalk Video-to-Video |
| infinitetalk-fast-video-to-video | `infinitetalk_fast_v2v.json` | Infinitetalk Fast V2V |

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create jobs table and management system
2. Implement API key authentication
3. Create job queue and processing system
4. Set up webhook/callback system

### Phase 2: WAN 2.2 Models
1. Implement Text-to-Video Turbo endpoint
2. Implement Image-to-Video Turbo endpoint
3. Create corresponding ComfyUI workflows

### Phase 3: WAN 2.5 Models
1. Implement Text-to-Video endpoint
2. Implement Image-to-Video endpoint
3. Create corresponding ComfyUI workflows

### Phase 4: Infinitetalk Models
1. Implement all 6 Infinitetalk variants
2. Create corresponding ComfyUI workflows
3. Add audio processing capabilities

### Phase 5: Optimization & Monitoring
1. Add rate limiting
2. Implement caching layer
3. Add monitoring and analytics
4. Optimize job queue processing
5. Add job result expiration and cleanup

## Security Considerations

1. **Input Validation**: Strict validation on all inputs (URLs, base64, prompts)
2. **File Size Limits**: Enforce limits on uploaded media
3. **Rate Limiting**: Per-API-key rate limiting
4. **CORS**: Configurable CORS policies
5. **SQL Injection**: Use parameterized queries
6. **XSS Prevention**: Sanitize all user inputs
7. **SSRF Prevention**: Validate and whitelist media URLs
8. **API Key Storage**: Store hashed keys, never plaintext
9. **Webhook Signatures**: HMAC signatures for callbacks
10. **Job Result Expiration**: Auto-delete results after 24-48 hours

## Performance Considerations

1. **Async Processing**: All generation is async via job queue
2. **Container Pool**: Pre-warmed ComfyUI containers
3. **Load Balancing**: Distribute jobs across multiple containers
4. **CDN Integration**: Serve results via CDN
5. **Database Indexing**: Optimize queries with proper indexes
6. **Connection Pooling**: Efficient database connections
7. **Caching**: Cache workflow definitions and configurations

## Monitoring & Logging

1. **Job Metrics**: Track success/failure rates per model
2. **Performance Metrics**: Monitor processing times
3. **Error Tracking**: Log all errors with context
4. **API Usage**: Track API calls per user/key
5. **Queue Metrics**: Monitor queue depth and processing rate
6. **Resource Usage**: Track container CPU/memory/GPU usage

## Testing Strategy

1. **Unit Tests**: Test each endpoint independently
2. **Integration Tests**: Test full job lifecycle
3. **Load Tests**: Test under high concurrent load
4. **Security Tests**: Penetration testing and vulnerability scanning
5. **Workflow Tests**: Validate ComfyUI workflow execution

## Documentation

1. **API Reference**: Complete endpoint documentation (this document)
2. **Getting Started Guide**: Quick start tutorial
3. **Workflow Guide**: How to create custom workflows
4. **Error Handling Guide**: Common errors and solutions
5. **Migration Guide**: Migrating from kie.ai/WaveSpeed.ai

## Future Enhancements

1. **Batch Processing**: Submit multiple jobs at once
2. **Streaming Results**: Progressive video generation updates
3. **Custom Workflows**: Allow users to upload custom workflows
4. **Model Versioning**: Support multiple versions of each model
5. **Multi-region Deployment**: Deploy across multiple regions
6. **GraphQL API**: Alternative GraphQL interface
7. **WebSocket Support**: Real-time job status updates
8. **SDK Libraries**: Official SDKs for Python, JavaScript, etc.
9. **Video Editing API**: Post-generation editing capabilities
10. **Model Fine-tuning**: Allow users to fine-tune models

## Pricing Structure (Optional)

If implementing billing:

| Model | Resolution | Cost per Second |
|-------|-----------|----------------|
| WAN 2.2 Turbo | 480p | $0.006 |
| WAN 2.2 Turbo | 580p | $0.009 |
| WAN 2.2 Turbo | 720p | $0.012 |
| WAN 2.5 | 720p | $0.012 |
| WAN 2.5 | 1080p | $0.020 |
| Infinitetalk | 480p | $0.030 per 5s |
| Infinitetalk | 720p | $0.060 per 5s |

## Conclusion

This architecture provides a comprehensive, scalable, and kie.ai/WaveSpeed.ai-compatible API for ComfyUI workflows. The design prioritizes:

- **Compatibility**: Easy migration from existing platforms
- **Extensibility**: Simple to add new models and workflows
- **Performance**: Async processing with efficient resource usage
- **Security**: Multiple layers of security controls
- **Developer Experience**: Clear documentation and error messages

The phased implementation approach allows for iterative development and testing, ensuring each component is solid before moving to the next.
