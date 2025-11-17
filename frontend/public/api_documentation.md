# ComfyUI API Reference

Complete API documentation for the ComfyUI Workflow Integration system.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Some endpoints require admin authentication. Include the admin token in the Authorization header:

```http
Authorization: Bearer <your-admin-token>
```

## Rate Limits

- **General API**: 100 requests per 15 minutes per IP
- **Job Creation**: 10 requests per minute per IP

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

---

## Containers

### List Containers
Get all ComfyUI containers with their status.

```http
GET /api/containers
```

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "container_id": "abc123...",
    "name": "comfyui-instance-1",
    "port": 8188,
    "status": "running",
    "workflow_id": null,
    "created_at": "2025-01-16T10:00:00Z",
    "docker_info": {
      "image": "comfyuiapi-comfyui:latest",
      "state": "running",
      "ports": ["8188:8188"]
    }
  }
]
```

### Create Container
Create a new ComfyUI container.

```http
POST /api/containers
Content-Type: application/json

{
  "name": "comfyui-instance-3",
  "port": 8190,
  "workflow_id": 1  // optional
}
```

**Validation**:
- `name`: Must follow Docker naming rules (alphanumeric, `-`, `_`)
- `port`: 1024-65535, must be unique
- `workflow_id`: Must exist in database (if provided)

**Response**: `201 Created`
```json
{
  "success": true,
  "container": {
    "id": 3,
    "name": "comfyui-instance-3",
    "port": 8190,
    "status": "created"
  }
}
```

### Start Container
```http
POST /api/containers/:id/start
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Container started successfully"
}
```

### Stop Container
```http
POST /api/containers/:id/stop
```

### Restart Container
```http
POST /api/containers/:id/restart
```

### Delete Container
```http
DELETE /api/containers/:id
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Container deleted successfully"
}
```

### Get Container Logs
```http
GET /api/containers/:id/logs?tail=100
```

**Query Parameters**:
- `tail` (integer): Number of lines (1-10000, default: 100)

**Response**: `200 OK`
```json
{
  "logs": "Container log output..."
}
```

### Get Container Stats
```http
GET /api/containers/:id/stats
```

**Response**: `200 OK`
```json
{
  "cpu_usage": 15.5,
  "memory_usage": 2048000000,
  "memory_limit": 8192000000,
  "network_rx": 1024000,
  "network_tx": 512000
}
```

---

## Workflows

### List Workflows
Get all available workflows.

```http
GET /api/workflows
```

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "name": "FLUX.1 Schnell",
    "description": "Fast text-to-image generation",
    "created_at": "2025-01-16T10:00:00Z",
    "updated_at": "2025-01-16T10:00:00Z"
  }
]
```

### Get Workflow
Get a specific workflow with full JSON.

```http
GET /api/workflows/:id
```

**Response**: `200 OK`
```json
{
  "id": 1,
  "name": "FLUX.1 Schnell",
  "description": "Fast text-to-image generation",
  "workflow_json": {
    "name": "FLUX.1 Schnell",
    "parameters": { ... },
    "workflow": { ... }
  },
  "created_at": "2025-01-16T10:00:00Z"
}
```

### Create Workflow
```http
POST /api/workflows
Content-Type: application/json

{
  "name": "My Custom Workflow",
  "description": "Custom workflow description",
  "workflow_json": { ... }
}
```

**Validation**:
- `name`: Required, must be unique
- `workflow_json`: Required, max 5MB, must be valid JSON object

**Response**: `201 Created`

### Update Workflow
```http
PUT /api/workflows/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "workflow_json": { ... }
}
```

### Delete Workflow
```http
DELETE /api/workflows/:id
```

**Note**: Cannot delete workflow if it's assigned to a container or has active jobs.

### Assign Workflow to Container
```http
POST /api/workflows/:id/assign/:containerId
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Workflow assigned successfully"
}
```

---

## Jobs

### Create Job
Submit a new workflow execution job.

```http
POST /api/jobs
Content-Type: application/json

{
  "workflow_id": 1,
  "container_id": 2,     // optional
  "priority": 0,          // optional, default: 0
  "parameters": {
    "prompt": "a beautiful sunset over mountains",
    "width": 1024,
    "height": 768,
    "steps": 4,
    "seed": -1
  }
}
```

**Parameters**:
- `workflow_id`: Required, must exist
- `container_id`: Optional, auto-selects if not provided
- `priority`: Optional, higher numbers processed first (default: 0)
- `parameters`: Required, workflow-specific parameters

**Response**: `201 Created`
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

### Get Job Status
Get detailed information about a job.

```http
GET /api/jobs/:id
```

**Response**: `200 OK`
```json
{
  "id": 123,
  "workflow_id": 1,
  "workflow_name": "FLUX.1 Schnell",
  "container_id": 2,
  "container_name": "comfyui-instance-1",
  "status": "completed",
  "priority": 0,
  "parameters": {
    "prompt": "a beautiful sunset",
    "width": 1024,
    "height": 768,
    "steps": 4
  },
  "input_image_url": null,
  "output_image_url": "http://localhost:3000/api/media/1234567890-abc.png",
  "comfyui_prompt_id": "prompt-abc-123",
  "error_message": null,
  "progress": 100,
  "created_at": "2025-01-16T10:30:00Z",
  "updated_at": "2025-01-16T10:31:00Z",
  "started_at": "2025-01-16T10:30:05Z",
  "completed_at": "2025-01-16T10:31:00Z"
}
```

**Status Values**:
- `queued` - Waiting in queue
- `processing` - Currently executing
- `completed` - Finished successfully
- `failed` - Error occurred
- `cancelled` - Manually cancelled

### List Jobs
Get a paginated list of jobs with optional filtering.

```http
GET /api/jobs?limit=50&offset=0&status=completed&workflow_id=1
```

**Query Parameters**:
- `limit` (integer): Results per page (default: 50)
- `offset` (integer): Pagination offset (default: 0)
- `status` (string): Filter by status (queued, processing, completed, failed, cancelled)
- `workflow_id` (integer): Filter by workflow ID

**Response**: `200 OK`
```json
{
  "jobs": [
    {
      "id": 123,
      "workflow_id": 1,
      "workflow_name": "FLUX.1 Schnell",
      "container_id": 2,
      "container_name": "comfyui-instance-1",
      "status": "completed",
      "priority": 0,
      "progress": 100,
      "output_image_url": "http://localhost:3000/api/media/...",
      "error_message": null,
      "created_at": "2025-01-16T10:30:00Z",
      "started_at": "2025-01-16T10:30:05Z",
      "completed_at": "2025-01-16T10:31:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### Cancel Job
Cancel a queued or processing job.

```http
POST /api/jobs/:id/cancel
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

**Errors**:
- `404` - Job not found
- `400` - Job cannot be cancelled (already completed/failed/cancelled)

### Retry Job
Retry a failed job.

```http
POST /api/jobs/:id/retry
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Job requeued successfully"
}
```

**Note**: Only failed jobs can be retried.

### Get Processor Stats
Get job processor and queue statistics.

```http
GET /api/jobs/stats/processor
```

**Response**: `200 OK`
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
    "failed": 12,
    "cancelled": 5
  },
  "metrics": {
    "average_processing_time_seconds": 45.32
  }
}
```

### Cleanup Old Jobs (Admin)
Delete completed, failed, and cancelled jobs older than specified days.

```http
DELETE /api/jobs/cleanup?days=7
Authorization: Bearer <admin-token>
```

**Query Parameters**:
- `days` (integer): Delete jobs older than this many days (default: 7)

**Response**: `200 OK`
```json
{
  "success": true,
  "deleted": 25
}
```

---

## Media

### Get Media File
Retrieve a generated image.

```http
GET /api/media/:filename
```

**Response**: `200 OK`
```
Content-Type: image/png
Cache-Control: public, max-age=31536000

[Binary image data]
```

### Get Storage Stats
Get media storage statistics.

```http
GET /api/media/stats/storage
```

**Response**: `200 OK`
```json
{
  "fileCount": 1523,
  "totalSize": 15234567890,
  "totalSizeMB": "14532.45",
  "storageType": "local",
  "storagePath": "/app/output"
}
```

---

## Health Check

### Server Health
Check if the server is running.

```http
GET /health
```

**Response**: `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2025-01-16T10:30:00.000Z"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## Rate Limit Headers

Rate limit information is included in response headers:

```http
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1642338000
```

When rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900

{
  "error": "Too many requests from this IP, please try again later."
}
```

---

## Examples

### Complete Workflow: Create and Monitor Job

```bash
# 1. List available workflows
curl http://localhost:3000/api/workflows

# 2. Create a job
JOB_ID=$(curl -s -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "parameters": {
      "prompt": "a majestic dragon flying over a medieval castle",
      "width": 1024,
      "height": 768,
      "steps": 4
    }
  }' | jq -r '.job.id')

echo "Job ID: $JOB_ID"

# 3. Poll for completion
while true; do
  STATUS=$(curl -s http://localhost:3000/api/jobs/$JOB_ID | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:3000/api/jobs/$JOB_ID | jq -r '.progress')

  echo "Status: $STATUS, Progress: $PROGRESS%"

  if [ "$STATUS" = "completed" ]; then
    IMAGE_URL=$(curl -s http://localhost:3000/api/jobs/$JOB_ID | jq -r '.output_image_url')
    echo "Image ready: $IMAGE_URL"
    break
  elif [ "$STATUS" = "failed" ]; then
    ERROR=$(curl -s http://localhost:3000/api/jobs/$JOB_ID | jq -r '.error_message')
    echo "Job failed: $ERROR"
    break
  fi

  sleep 2
done

# 4. Download image
curl -o output.png $IMAGE_URL
```

### Admin: Cleanup Old Jobs

```bash
# Delete jobs older than 7 days
curl -X DELETE "http://localhost:3000/api/jobs/cleanup?days=7" \
  -H "Authorization: Bearer your-admin-token-here"
```

### Python Client Example

```python
import requests
import time

class ComfyUIClient:
    def __init__(self, base_url='http://localhost:3000'):
        self.base_url = base_url

    def create_job(self, workflow_id, parameters, container_id=None, priority=0):
        """Create a new job"""
        response = requests.post(f'{self.base_url}/api/jobs', json={
            'workflow_id': workflow_id,
            'container_id': container_id,
            'priority': priority,
            'parameters': parameters
        })
        response.raise_for_status()
        return response.json()['job']

    def get_job(self, job_id):
        """Get job status"""
        response = requests.get(f'{self.base_url}/api/jobs/{job_id}')
        response.raise_for_status()
        return response.json()

    def wait_for_job(self, job_id, poll_interval=2):
        """Wait for job to complete"""
        while True:
            job = self.get_job(job_id)

            if job['status'] == 'completed':
                return job
            elif job['status'] == 'failed':
                raise Exception(f"Job failed: {job['error_message']}")

            print(f"Progress: {job['progress']}%")
            time.sleep(poll_interval)

    def download_image(self, url, filename):
        """Download generated image"""
        response = requests.get(url)
        response.raise_for_status()

        with open(filename, 'wb') as f:
            f.write(response.content)

# Usage
client = ComfyUIClient()

# Create and wait for job
job = client.create_job(
    workflow_id=1,
    parameters={
        'prompt': 'a beautiful landscape',
        'width': 1024,
        'height': 768,
        'steps': 4
    }
)

print(f"Job created: {job['id']}")

# Wait for completion
completed_job = client.wait_for_job(job['id'])

# Download image
client.download_image(completed_job['output_image_url'], 'output.png')
print("Image saved to output.png")
```

---

## WebSocket Support (Future)

Real-time job progress updates via WebSocket will be available in future versions:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/jobs/stream');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Job ${data.jobId}: ${data.progress}%`);
};
```

---

## Changelog

### v1.0.0 (2025-01-16)
- Initial release with workflow integration
- Job queue system
- ComfyUI API client
- Rate limiting
- Admin authentication
- Scheduled cleanup tasks
- Winston logging

---

For more information, see [WORKFLOW_INTEGRATION.md](./WORKFLOW_INTEGRATION.md).
