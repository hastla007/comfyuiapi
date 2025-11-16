# ComfyUI API Quick Reference Guide

**Quick lookup for all model endpoints**

## Authentication

All requests require authentication:
```http
Authorization: Key YOUR_API_KEY
```

## Base URL

```
Production: https://api.yourcompanyname.com/api/v1
Development: http://localhost:3000/api/v1
```

---

## Quick Endpoint Reference

### Video Processing & Enhancement

| Model | Endpoint | Primary Use |
|-------|----------|-------------|
| **FlashVSR** | `POST /models/flashvsr/upscale/video` | Fast video upscaling |
| **RIFE (Image)** | `POST /models/rife/image` | Interpolate between 2 images |
| **RIFE (Video)** | `POST /models/rife/video` | Smooth video slow-motion |
| **Topaz Video** | `POST /models/topaz/upscale/video` | Professional upscaling + interpolation |
| **SeedVR** | `POST /models/seedvr/upscale/video` | High-quality texture upscaling |

### Text-to-Video Generation

| Model | Endpoint | Best For |
|-------|----------|----------|
| **Veo 2** | `POST /models/veo/2/text-to-video` | Google's advanced generation |
| **Veo 3** | `POST /models/veo/3/text-to-video` | Latest Google model |
| **Veo 3.1** | `POST /models/veo/3.1/text-to-video` | Fastest Google model |
| **Hailuo 01** | `POST /models/hailuo/01/text-to-video` | MiniMax live generation |
| **Hailuo 02** | `POST /models/hailuo/02/text-to-video` | MiniMax standard/768p/512p |
| **Kling 1.6** | `POST /models/kling/1.6/text-to-video` | Basic Kling model |
| **Kling 2.1 Pro** | `POST /models/kling/2.1/pro/text-to-video` | Professional quality |
| **Kling 2.5 Turbo** | `POST /models/kling/2.5/turbo-pro/text-to-video` | Top-tier motion |
| **Mochi** | `POST /models/mochi/text-to-video` | Featured model |
| **Hunyuan** | `POST /models/hunyuan/text-to-video` | Hunyuan Video |
| **Luma Dream** | `POST /models/luma-dream-machine/text-to-video` | Creative generation |
| **PixVerse** | `POST /models/pixverse/text-to-video` | PixVerse T2V |
| **LTX Video** | `POST /models/ltx-video/text-to-video` | LTX model |
| **Stable Video** | `POST /models/stable-video/text-to-video` | Stable Diffusion based |
| **Wan 2.5** | `POST /models/wan/2.5/text-to-video` | Wan T2V |

### Image-to-Video Generation

| Model | Endpoint | Best For |
|-------|----------|----------|
| **Veo 2 I2V** | `POST /models/veo/2/image-to-video` | Realistic motion from images |
| **Veo 3.1 Fast I2V** | `POST /models/veo/3.1/fast/image-to-video` | Fast image animation |
| **Kling 2.1 Master I2V** | `POST /models/kling/2.1/master/image-to-video` | Top-tier I2V quality |
| **Kling 2.5 Turbo I2V** | `POST /models/kling/2.5/turbo-pro/image-to-video` | Unparalleled fluidity |
| **Hailuo-02 Standard** | `POST /models/hailuo/02/standard/image-to-video` | Standard resolution I2V |
| **Hailuo-02 768p** | `POST /models/hailuo/02/768p/image-to-video` | 768p I2V |
| **Hailuo-02 512p** | `POST /models/hailuo/02/512p/image-to-video` | 512p I2V |
| **Wan Pro** | `POST /models/wan/pro/image-to-video` | Dynamic video from images |
| **Framepack** | `POST /models/framepack/image-to-video` | Efficient autoregressive |
| **Stable Video I2V** | `POST /models/stable-video/image-to-video` | Stable Diffusion I2V |

### Specialized (Avatars & Lipsync)

| Model | Endpoint | Primary Use |
|-------|----------|-------------|
| **MultiTalk** | `POST /models/multitalk/generate` | Talking avatar with TTS |
| **Omnihuman v1.5** | `POST /models/omnihuman/1.5/generate` | Human animation with audio |
| **Sync Lipsync 2.0** | `POST /models/sync-lipsync/2.0/generate` | Realistic lipsync |
| **PixVerse Lipsync** | `POST /models/pixverse/lipsync/generate` | PixVerse lipsync |
| **Kling Avatar Pro** | `POST /models/kling/avatar-pro/generate` | Avatar videos (human/animal/cartoon) |

---

## Common Request Patterns

### Simple Video Upscaling (FlashVSR)

```bash
curl -X POST https://api.example.com/api/v1/models/flashvsr/upscale/video \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/input.mp4",
    "scale_factor": 2
  }'
```

### Text-to-Video (Veo 3.1)

```bash
curl -X POST https://api.example.com/api/v1/models/veo/3.1/text-to-video \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene sunset over mountains",
    "duration": 5,
    "fps": 24
  }'
```

### Image-to-Video (Kling 2.5)

```bash
curl -X POST https://api.example.com/api/v1/models/kling/2.5/turbo-pro/image-to-video \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/portrait.jpg",
    "prompt": "Make the person wave and smile",
    "duration": 3
  }'
```

### Frame Interpolation (RIFE)

```bash
curl -X POST https://api.example.com/api/v1/models/rife/video \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/input.mp4",
    "target_fps": 60,
    "num_frames": 2
  }'
```

### Talking Avatar (MultiTalk)

```bash
curl -X POST https://api.example.com/api/v1/models/multitalk/generate \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/portrait.jpg",
    "text": "Hello, welcome to our presentation",
    "voice": "en-US-female-1"
  }'
```

---

## Response Handling

### Async Response (Default)

All endpoints return immediately with job information:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "urls": {
    "status": "/api/v1/jobs/550e8400.../status",
    "result": "/api/v1/jobs/550e8400...",
    "cancel": "/api/v1/jobs/550e8400.../cancel"
  }
}
```

### Check Job Status

```bash
curl -X GET https://api.example.com/api/v1/jobs/550e8400.../status \
  -H "Authorization: Key YOUR_API_KEY"
```

**Response (Processing)**:
```json
{
  "job_id": "550e8400...",
  "status": "processing",
  "progress": 45,
  "current_step": "rendering_frames"
}
```

**Response (Completed)**:
```json
{
  "job_id": "550e8400...",
  "status": "completed",
  "result": {
    "video_url": "https://storage.example.com/output.mp4",
    "thumbnail_url": "https://storage.example.com/thumb.jpg",
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

## Common Parameters

### Shared Across Most Endpoints

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `webhook_url` | string | null | URL for completion notification |
| `sync_mode` | boolean | false | Wait for completion (blocks request) |
| `priority` | string | "normal" | "low", "normal", "high" |
| `output_format` | string | "mp4" | "mp4", "mov", "webm" |

### Video Processing Specific

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `video_url` | string | required | Input video URL |
| `scale_factor` | integer | 2 | Upscaling factor (1-8) |
| `target_fps` | integer | varies | Target frames per second |

### Text-to-Video Specific

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Video description |
| `negative_prompt` | string | "" | What to avoid |
| `duration` | integer | 5 | Video duration (seconds) |
| `fps` | integer | 24 | Frames per second |
| `aspect_ratio` | string | "16:9" | "16:9", "9:16", "1:1", "4:3" |

### Image-to-Video Specific

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image_url` | string | required | Input image URL |
| `prompt` | string | "" | Motion description |
| `duration` | integer | 3 | Video duration (seconds) |
| `motion_intensity` | float | 0.5 | Motion strength (0.0-1.0) |

---

## Error Codes Quick Reference

| HTTP | Code | Description | Solution |
|------|------|-------------|----------|
| 400 | `INVALID_REQUEST` | Bad request format | Check JSON syntax |
| 401 | `UNAUTHORIZED` | Invalid API key | Verify API key |
| 402 | `INSUFFICIENT_CREDITS` | Not enough credits | Purchase credits |
| 404 | `NOT_FOUND` | Job not found | Check job ID |
| 422 | `VALIDATION_ERROR` | Invalid parameters | Check parameter values |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry |
| 500 | `INTERNAL_ERROR` | Server error | Contact support |

---

## Rate Limits

| Tier | Requests/Min | Concurrent Jobs |
|------|--------------|-----------------|
| Free | 10 | 2 |
| Pro | 60 | 10 |
| Enterprise | Unlimited | 50 |

---

## Job Management Endpoints

| Action | Endpoint | Method |
|--------|----------|--------|
| Get Status | `/api/v1/jobs/{job_id}/status` | GET |
| Get Result | `/api/v1/jobs/{job_id}` | GET |
| Cancel Job | `/api/v1/jobs/{job_id}/cancel` | POST |
| Retry Job | `/api/v1/jobs/{job_id}/retry` | POST |
| List Jobs | `/api/v1/jobs?status=completed&limit=10` | GET |

---

## Webhook Configuration

### Register Webhook

```bash
curl -X POST https://api.example.com/api/v1/webhooks/register \
  -H "Authorization: Key YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook",
    "events": ["job.completed", "job.failed"],
    "secret": "your_webhook_secret"
  }'
```

### Webhook Events

- `job.queued` - Job added to queue
- `job.started` - Job processing started
- `job.progress` - Progress update
- `job.completed` - Job finished successfully
- `job.failed` - Job failed

---

## WebSocket Streaming

### Connect to Job Stream

```javascript
const ws = new WebSocket(
  'ws://api.example.com/api/v1/jobs/550e8400.../stream?api_key=YOUR_KEY'
);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Progress: ${data.progress}%`);
};
```

### Event Types

- `progress` - Processing progress update
- `completed` - Job completed
- `failed` - Job failed
- `cancelled` - Job cancelled

---

## SDK Examples

### JavaScript/Node.js

```javascript
const response = await fetch('https://api.example.com/api/v1/models/flashvsr/upscale/video', {
  method: 'POST',
  headers: {
    'Authorization': 'Key YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    video_url: 'https://example.com/input.mp4',
    scale_factor: 2
  })
});

const job = await response.json();
console.log('Job ID:', job.job_id);

// Poll for status
const checkStatus = async () => {
  const status = await fetch(job.urls.status, {
    headers: { 'Authorization': 'Key YOUR_API_KEY' }
  });
  return await status.json();
};
```

### Python

```python
import requests

response = requests.post(
    'https://api.example.com/api/v1/models/flashvsr/upscale/video',
    headers={'Authorization': 'Key YOUR_API_KEY'},
    json={
        'video_url': 'https://example.com/input.mp4',
        'scale_factor': 2
    }
)

job = response.json()
print(f"Job ID: {job['job_id']}")

# Check status
status_response = requests.get(
    job['urls']['status'],
    headers={'Authorization': 'Key YOUR_API_KEY'}
)
status = status_response.json()
print(f"Status: {status['status']}, Progress: {status.get('progress', 0)}%")
```

### cURL Script

```bash
#!/bin/bash

API_KEY="YOUR_API_KEY"
API_URL="https://api.example.com/api/v1"

# Submit job
JOB_RESPONSE=$(curl -s -X POST "$API_URL/models/flashvsr/upscale/video" \
  -H "Authorization: Key $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/input.mp4",
    "scale_factor": 2
  }')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job_id')
echo "Job ID: $JOB_ID"

# Poll for completion
while true; do
  STATUS_RESPONSE=$(curl -s -X GET "$API_URL/jobs/$JOB_ID/status" \
    -H "Authorization: Key $API_KEY")

  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')

  if [ "$STATUS" = "completed" ]; then
    VIDEO_URL=$(echo $STATUS_RESPONSE | jq -r '.result.video_url')
    echo "Completed! Video URL: $VIDEO_URL"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Job failed"
    break
  fi

  PROGRESS=$(echo $STATUS_RESPONSE | jq -r '.progress // 0')
  echo "Progress: $PROGRESS%"
  sleep 5
done
```

---

## Tips & Best Practices

### 1. Use Webhooks for Long-Running Jobs
Instead of polling, register a webhook to get notified when jobs complete.

### 2. Set Appropriate Timeouts
Video processing can take time. Set HTTP timeouts to at least 5 minutes for sync requests.

### 3. Handle Rate Limits Gracefully
Check `X-RateLimit-Remaining` header and implement exponential backoff.

### 4. Validate Input URLs
Ensure input URLs are publicly accessible and in supported formats.

### 5. Use Idempotency Keys
For critical operations, use `idempotency_key` to prevent duplicate processing:
```json
{
  "video_url": "...",
  "idempotency_key": "unique-request-id-12345"
}
```

### 6. Monitor Credit Usage
Check credit balance regularly to avoid service interruptions.

### 7. Test with Small Files First
Start with short, low-resolution videos to test integration before processing large files.

### 8. Cache Results
Store processed video URLs to avoid re-processing the same content.

---

## Pricing Examples

### FlashVSR Upscaling
**Input**: 1080p, 5 seconds, 24fps
**Calculation**: 1920 × 1080 × 120 frames = 248.8 MP
**Cost**: 248.8 × $0.0005 = **$0.12**

### Topaz Video (4K Upscale)
**Input**: 1080p → 4K, 10 seconds, 30fps
**Calculation**: 3840 × 2160 × 300 frames = 2,488 MP
**Cost**: 2,488 × $0.001 = **$2.49**

### Text-to-Video (Veo 3.1)
**Output**: 1080p, 5 seconds, 24fps
**Cost**: Fixed rate of **$0.50** per generation

---

## Support & Resources

- **Documentation**: https://docs.yourapi.com
- **API Status**: https://status.yourapi.com
- **Support**: support@yourapi.com
- **Community**: https://community.yourapi.com
- **GitHub Examples**: https://github.com/yourcompany/api-examples

---

## Changelog

**v1.0 (2025-11-16)**
- Initial API design
- 36 model endpoints across 4 categories
- Async job processing
- Webhook support
- WebSocket streaming

---

**Last Updated**: 2025-11-16
**Version**: 1.0
