# ComfyUI Workflow Integration Guide

This document describes the workflow integration system that allows you to execute ComfyUI workflows via API.

## Overview

The workflow integration consists of:

1. **Workflow JSON Templates** - Parameterized ComfyUI workflows for different models
2. **Job Queue System** - Background processing of workflow execution jobs
3. **ComfyUI API Client** - Communication with ComfyUI containers via HTTP and WebSocket
4. **Media Storage** - Download input images and store generated outputs
5. **Monitoring & Logging** - Track job progress and system health

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  API Server  │────▶│  Job Queue      │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │                      │
                           │                      ▼
                           │              ┌─────────────────┐
                           │              │  Job Processor  │
                           │              └─────────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │   Database   │     │ ComfyUI Client  │
                    └──────────────┘     └─────────────────┘
                                                 │
                                                 ▼
                                         ┌─────────────────┐
                                         │ ComfyUI Docker  │
                                         │   Containers    │
                                         └─────────────────┘
```

## Workflow Templates

Three pre-configured workflows are provided for Flux models:

### 1. FLUX.1 Schnell (`flux-schnell-api.json`)
- **Purpose**: Fast text-to-image generation
- **Speed**: ~4 steps, optimized for quick results
- **Model**: flux1-schnell-fp8.safetensors (fp8 quantized)
- **Use Case**: Rapid prototyping, previews

**Parameters**:
- `prompt` (string): Text description
- `width` (integer): Image width (512-2048, default: 1024)
- `height` (integer): Image height (512-2048, default: 1024)
- `seed` (integer): Random seed (-1 for random)
- `steps` (integer): Sampling steps (1-10, default: 4)

### 2. FLUX.1 Dev (`flux-dev-api.json`)
- **Purpose**: High-quality balanced generation
- **Speed**: ~20 steps, good quality/speed trade-off
- **Model**: flux1-dev.sft
- **Use Case**: Production quality images

**Parameters**:
- `prompt` (string): Text description
- `width` (integer): Image width (512-2048, default: 1024)
- `height` (integer): Image height (512-2048, default: 1024)
- `seed` (integer): Random seed (-1 for random)
- `steps` (integer): Sampling steps (10-50, default: 20)
- `guidance_scale` (number): Prompt adherence (0.1-2.0, default: 1.0)

### 3. FLUX.1 Pro (`flux-pro-api.json`)
- **Purpose**: Maximum quality generation
- **Speed**: ~30+ steps, highest quality
- **Model**: flux1-pro.sft
- **Use Case**: Final production, professional work

**Parameters**:
- `prompt` (string): Text description
- `width` (integer): Image width (512-2048, default: 1024)
- `height` (integer): Image height (512-2048, default: 1024)
- `seed` (integer): Random seed (-1 for random)
- `steps` (integer): Sampling steps (20-100, default: 30)
- `guidance_scale` (number): Prompt adherence (1.0-10.0, default: 3.5)
- `denoise` (number): Denoising strength (0.0-1.0, default: 1.0)

## API Endpoints

### Job Management

#### Create a Job
```http
POST /api/jobs
Content-Type: application/json

{
  "workflow_id": 1,
  "container_id": 2,  // optional, auto-selects if not provided
  "priority": 0,      // optional, higher = processed first
  "parameters": {
    "prompt": "a beautiful sunset over mountains",
    "width": 1024,
    "height": 768,
    "steps": 4
  }
}
```

**Response**:
```json
{
  "success": true,
  "job": {
    "id": 123,
    "workflow_id": 1,
    "container_id": 2,
    "status": "queued",
    "priority": 0,
    "parameters": { ... },
    "created_at": "2025-01-16T10:30:00Z"
  }
}
```

#### Get Job Status
```http
GET /api/jobs/:id
```

**Response**:
```json
{
  "id": 123,
  "workflow_id": 1,
  "workflow_name": "FLUX.1 Schnell",
  "container_id": 2,
  "container_name": "comfyui-instance-1",
  "status": "completed",
  "priority": 0,
  "parameters": { ... },
  "output_image_url": "http://localhost:3000/api/media/1234567890-abc.png",
  "progress": 100,
  "created_at": "2025-01-16T10:30:00Z",
  "started_at": "2025-01-16T10:30:05Z",
  "completed_at": "2025-01-16T10:31:00Z"
}
```

**Job Statuses**:
- `queued` - Waiting to be processed
- `processing` - Currently being executed
- `completed` - Successfully finished
- `failed` - Error occurred
- `cancelled` - Manually cancelled

#### List Jobs
```http
GET /api/jobs?limit=50&offset=0&status=completed&workflow_id=1
```

**Query Parameters**:
- `limit` (integer): Results per page (default: 50)
- `offset` (integer): Pagination offset (default: 0)
- `status` (string): Filter by status
- `workflow_id` (integer): Filter by workflow

#### Cancel a Job
```http
POST /api/jobs/:id/cancel
```

Only works for jobs in `queued` or `processing` status.

#### Retry a Failed Job
```http
POST /api/jobs/:id/retry
```

Requeues a failed job with the same parameters.

#### Get Processor Stats
```http
GET /api/jobs/stats/processor
```

**Response**:
```json
{
  "processor": {
    "isRunning": true,
    "activeJobs": 3,
    "maxConcurrentJobs": 10
  },
  "queue": {
    "queued": 15,
    "processing": 3,
    "completed": 1250,
    "failed": 12
  },
  "metrics": {
    "average_processing_time_seconds": 45.32
  }
}
```

#### Cleanup Old Jobs (Admin Only)
```http
DELETE /api/jobs/cleanup?days=7
Authorization: Bearer <admin-token>
```

Deletes completed/failed/cancelled jobs older than specified days.

### Media Management

#### Get Generated Image
```http
GET /api/media/:filename
```

Returns the image file with appropriate Content-Type and caching headers.

#### Get Storage Stats
```http
GET /api/media/stats/storage
```

**Response**:
```json
{
  "fileCount": 1523,
  "totalSize": 15234567890,
  "totalSizeMB": "14532.45",
  "storageType": "local",
  "storagePath": "/app/output"
}
```

## Job Processing Flow

1. **Job Creation**
   - Client submits job via POST /api/jobs
   - Job is inserted into database with status `queued`
   - Returns immediately with job ID

2. **Job Queue**
   - Job processor polls database every 2 seconds
   - Selects highest priority, oldest job
   - Updates status to `processing`

3. **Workflow Execution**
   - Loads workflow template from database
   - Substitutes parameters ({{prompt}}, {{width}}, etc.)
   - Selects available ComfyUI container
   - Creates WebSocket connection for progress updates
   - Queues prompt to ComfyUI

4. **Progress Tracking**
   - WebSocket receives real-time updates
   - Updates job progress in database (0-100%)
   - Logs execution events

5. **Completion**
   - Retrieves output images from ComfyUI
   - Saves images to media storage
   - Updates job with output_image_url
   - Sets status to `completed`

6. **Error Handling**
   - Catches all errors during execution
   - Updates job status to `failed`
   - Stores error message
   - Disconnects WebSocket

## Rate Limiting

Rate limits are enforced to prevent abuse:

### General API Endpoints
- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Applies to**: All `/api/*` routes

### Job Creation
- **Window**: 1 minute
- **Limit**: 10 job creations per IP
- **Applies to**: POST `/api/jobs`

Rate limit headers are included in responses:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1642338000
```

## Authentication

Admin-only endpoints require authentication via Bearer token:

```http
Authorization: Bearer <admin-token>
```

### Protected Endpoints
- `DELETE /api/jobs/cleanup` - Cleanup old jobs

### Setting Admin Token

Set `ADMIN_TOKEN` in `.env`:
```bash
# Generate a secure token
openssl rand -hex 32

# Add to .env
ADMIN_TOKEN=your-generated-token-here
```

If not set, a temporary token is generated on startup (logged to console).

## Logging

Structured logging with Winston:

### Log Files
- `logs/error.log` - Error level logs only
- `logs/combined.log` - All logs

### Log Levels
- `error` - Errors and exceptions
- `warn` - Warnings
- `info` - General information (default)
- `debug` - Detailed debug information

### Configuration
Set log level via environment:
```bash
LOG_LEVEL=debug
```

### Log Format
```json
{
  "level": "info",
  "message": "Job 123 completed successfully",
  "service": "comfyui-api",
  "timestamp": "2025-01-16 10:31:00"
}
```

## Scheduled Tasks

Automatic maintenance tasks run via cron:

### Daily Cleanup (2 AM)
- Deletes completed/failed/cancelled jobs older than 7 days
- Reduces database size

### Media Cleanup (3 AM)
- Deletes media files older than 7 days
- Frees up storage space

### Stuck Job Detection (Every 30 minutes)
- Marks jobs as failed if processing > 1 hour
- Prevents queue from blocking

### Stats Logging (1 AM)
- Logs storage and job statistics
- Helps with capacity planning

## Database Schema

### Jobs Table
```sql
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflows(id),
  container_id INTEGER REFERENCES containers(id),
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  priority INTEGER DEFAULT 0,
  parameters JSONB NOT NULL,
  input_image_url TEXT,
  output_image_url TEXT,
  comfyui_prompt_id VARCHAR(255),
  error_message TEXT,
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_jobs_status_priority
  ON jobs(status, priority DESC, created_at ASC);

CREATE INDEX idx_jobs_comfyui_prompt_id
  ON jobs(comfyui_prompt_id);
```

## Performance Tuning

### Concurrent Jobs
Adjust max concurrent jobs in `jobProcessor.js`:
```javascript
this.maxConcurrentJobs = 10; // Default
```

### Poll Interval
Adjust queue polling frequency:
```javascript
this.pollInterval = 2000; // 2 seconds (default)
```

### Timeout Settings
Job execution timeout:
```javascript
// In jobProcessor.js - waitForCompletion()
timeout = 300000 // 5 minutes (default)
```

## Troubleshooting

### Jobs Stuck in Processing
- Check ComfyUI container logs: `docker logs <container-name>`
- Verify container is running: `GET /api/containers`
- Check job processor is running: `GET /api/jobs/stats/processor`
- Manually mark as failed or wait for auto-cleanup (30 min intervals)

### Images Not Generating
- Verify workflow JSON is valid
- Check model files are downloaded in ComfyUI container
- Ensure parameters are within valid ranges
- Check ComfyUI logs for errors

### High Memory Usage
- Reduce `maxConcurrentJobs`
- Clean up old jobs and media files
- Increase cleanup frequency

### WebSocket Connection Issues
- Ensure ComfyUI container is accessible
- Check firewall/network settings
- Verify container port mapping

## Example Usage

### Basic Text-to-Image Generation

```bash
# 1. Create a job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "parameters": {
      "prompt": "a majestic dragon flying over a medieval castle at sunset",
      "width": 1024,
      "height": 768,
      "steps": 4
    }
  }'

# Response: {"success": true, "job": {"id": 123, ...}}

# 2. Check job status
curl http://localhost:3000/api/jobs/123

# 3. Download image when completed
curl http://localhost:3000/api/media/1234567890-abc.png -o output.png
```

### Using Python

```python
import requests
import time

# Create job
response = requests.post('http://localhost:3000/api/jobs', json={
    'workflow_id': 1,
    'parameters': {
        'prompt': 'a beautiful landscape with mountains and lake',
        'width': 1024,
        'height': 1024,
        'steps': 4
    }
})

job_id = response.json()['job']['id']
print(f"Job created: {job_id}")

# Poll for completion
while True:
    status = requests.get(f'http://localhost:3000/api/jobs/{job_id}').json()

    if status['status'] == 'completed':
        print(f"Image ready: {status['output_image_url']}")
        break
    elif status['status'] == 'failed':
        print(f"Job failed: {status['error_message']}")
        break
    else:
        print(f"Progress: {status['progress']}%")
        time.sleep(2)

# Download image
if status['status'] == 'completed':
    image_response = requests.get(status['output_image_url'])
    with open('output.png', 'wb') as f:
        f.write(image_response.content)
```

## Next Steps

- **Frontend Integration**: Create UI components for job creation and monitoring
- **Image-to-Image**: Add support for input images in workflows
- **Custom Workflows**: Import and manage custom ComfyUI workflows
- **S3 Storage**: Add AWS S3 integration for scalable media storage
- **Webhook Notifications**: Notify external systems on job completion
- **Batch Processing**: Submit multiple jobs at once
- **API Keys**: User-based authentication and quotas

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review API documentation
- Check ComfyUI container status
- Monitor system resources
