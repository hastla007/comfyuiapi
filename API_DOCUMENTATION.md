# ComfyUI Docker Manager - Complete API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Base URL & Authentication](#base-url--authentication)
3. [Quick Start Guide](#quick-start-guide)
4. [Container Management](#container-management)
5. [Workflow Management](#workflow-management)
6. [Job Management](#job-management)
7. [Advanced Jobs (Batch, Scheduled, Templates)](#advanced-jobs)
8. [Media & Storage](#media--storage)
9. [Health & Monitoring](#health--monitoring)
10. [Authentication & User Management](#authentication--user-management)
11. [Admin APIs](#admin-apis)
12. [GPU Management](#gpu-management)
13. [Container Pools & Auto-Scaling](#container-pools--auto-scaling)
14. [Specialized AI Models](#specialized-ai-models)
15. [Error Handling](#error-handling)
16. [Rate Limiting](#rate-limiting)
17. [Webhooks & Callbacks](#webhooks--callbacks)

---

## Overview

The ComfyUI Docker Manager API is a comprehensive REST API for managing containerized ComfyUI instances and executing AI-powered image/video generation workflows. This API provides enterprise-grade features including:

- **Container Lifecycle Management**: Start, stop, restart, and monitor Docker containers
- **Job Queue System**: Submit, track, and manage AI generation jobs
- **Batch Processing**: Process multiple jobs in parallel
- **Scheduled Jobs**: Cron-based recurring job execution
- **GPU Resource Management**: Allocate and monitor GPU resources
- **Auto-Scaling**: Dynamic container pool management
- **Real-time Monitoring**: Health checks, metrics, and logging
- **Multi-tenant Support**: Organization and user management
- **API Key Authentication**: Secure service-to-service communication

### Technology Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Containerization**: Docker with NVIDIA GPU support
- **Authentication**: JWT + API Keys
- **Monitoring**: Prometheus metrics

---

## Base URL & Authentication

### Base URL

```
http://localhost:3000/api
```

### Authentication Methods

#### 1. API Key Authentication (Recommended for Service-to-Service)

```bash
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:3000/api/jobs
```

#### 2. JWT Bearer Token (For User Sessions)

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:3000/api/jobs
```

### Getting Your API Key

```bash
# Admin creates API key for a user
curl -X POST http://localhost:3000/api/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bot@example.com",
    "name": "Production Bot",
    "permissions": ["jobs:create", "jobs:read", "containers:read"],
    "rateLimit": 1000
  }'
```

---

## Quick Start Guide

### Step 1: Check System Health

```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-01-16T10:30:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "healthy",
    "responseTime": 2
  },
  "docker": {
    "status": "healthy",
    "containers": 3,
    "running": 2
  }
}
```

### Step 2: List Available Workflows

```bash
curl http://localhost:3000/api/workflows
```

**Response:**
```json
{
  "success": true,
  "workflows": [
    {
      "id": 1,
      "name": "FLUX.1 Schnell",
      "description": "Fast text-to-image generation (4 steps)",
      "workflow_json": { ... },
      "created_at": "2025-01-16T10:00:00Z"
    }
  ]
}
```

### Step 3: Create Your First Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "parameters": {
      "prompt": "a beautiful sunset over mountains, dramatic lighting",
      "width": 1024,
      "height": 768,
      "steps": 4,
      "seed": -1
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": 123,
    "workflow_id": 1,
    "status": "queued",
    "priority": 0,
    "created_at": "2025-01-16T10:30:00Z"
  }
}
```

### Step 4: Check Job Status

```bash
curl http://localhost:3000/api/jobs/123 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "id": 123,
  "workflow_id": 1,
  "workflow_name": "FLUX.1 Schnell",
  "status": "completed",
  "progress": 100,
  "output_image_url": "http://localhost:3000/api/media/1234567890-abc.png",
  "created_at": "2025-01-16T10:30:00Z",
  "started_at": "2025-01-16T10:30:05Z",
  "completed_at": "2025-01-16T10:31:00Z"
}
```

### Step 5: Download Your Image

```bash
curl http://localhost:3000/api/media/1234567890-abc.png -o result.png
```

---

## Container Management

Manage Docker containers running ComfyUI instances.

### List All Containers

```bash
curl http://localhost:3000/api/containers
```

**Response:**
```json
{
  "success": true,
  "containers": [
    {
      "id": "abc123def456",
      "name": "comfyui-instance-1",
      "port": 8190,
      "status": "running",
      "workflow_id": 1,
      "created_at": "2025-01-16T09:00:00Z"
    }
  ]
}
```

### Create a New Container

```bash
curl -X POST http://localhost:3000/api/containers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "comfyui-sdxl",
    "port": 8190,
    "workflowId": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "container": {
    "id": "abc123def456",
    "name": "comfyui-sdxl",
    "port": 8190,
    "instanceId": 1,
    "status": "running"
  }
}
```

### Start a Container

```bash
curl -X POST http://localhost:3000/api/containers/abc123def456/start
```

**Response:**
```json
{
  "success": true,
  "message": "Container started successfully",
  "container": {
    "id": "abc123def456",
    "status": "running"
  }
}
```

### Stop a Container

```bash
curl -X POST http://localhost:3000/api/containers/abc123def456/stop
```

**Response:**
```json
{
  "success": true,
  "message": "Container stopped successfully",
  "container": {
    "id": "abc123def456",
    "status": "stopped"
  }
}
```

### Restart a Container

```bash
curl -X POST http://localhost:3000/api/containers/abc123def456/restart
```

**Response:**
```json
{
  "success": true,
  "message": "Container restarted successfully",
  "container": {
    "id": "abc123def456",
    "status": "running"
  }
}
```

### Delete a Container (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/containers/abc123def456 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Container deleted successfully"
}
```

### Get Container Logs

```bash
# Get last 100 lines
curl http://localhost:3000/api/containers/abc123def456/logs?tail=100

# Get all logs
curl http://localhost:3000/api/containers/abc123def456/logs
```

**Response:**
```json
{
  "success": true,
  "logs": "Container startup logs...\nComfyUI initialized...\nReady to process jobs..."
}
```

### Get Container Statistics

```bash
curl http://localhost:3000/api/containers/abc123def456/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "cpu_percent": 45.2,
    "memory_usage": 2147483648,
    "memory_limit": 8589934592,
    "memory_percent": 25.0,
    "network_rx_bytes": 1048576,
    "network_tx_bytes": 524288
  }
}
```

---

## Workflow Management

Manage workflow definitions that define how jobs are processed.

### List All Workflows

```bash
curl http://localhost:3000/api/workflows
```

**Response:**
```json
{
  "success": true,
  "workflows": [
    {
      "id": 1,
      "name": "FLUX.1 Schnell",
      "description": "Fast text-to-image generation (4 steps)",
      "workflow_json": { ... },
      "created_at": "2025-01-16T10:00:00Z",
      "updated_at": "2025-01-16T10:00:00Z"
    }
  ]
}
```

### Get Specific Workflow

```bash
curl http://localhost:3000/api/workflows/1
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": 1,
    "name": "FLUX.1 Schnell",
    "description": "Fast text-to-image generation (4 steps)",
    "workflow_json": {
      "nodes": [ ... ],
      "connections": [ ... ]
    },
    "created_at": "2025-01-16T10:00:00Z"
  }
}
```

### Create a New Workflow

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom SDXL Workflow",
    "description": "High-quality image generation with SDXL",
    "workflow_json": {
      "nodes": [
        {
          "id": "1",
          "type": "CheckpointLoaderSimple",
          "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" }
        }
      ]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": 2,
    "name": "Custom SDXL Workflow",
    "description": "High-quality image generation with SDXL",
    "workflow_json": { ... },
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

### Update a Workflow (Requires API Key)

```bash
curl -X PUT http://localhost:3000/api/workflows/2 \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated SDXL Workflow",
    "description": "Enhanced SDXL workflow with LoRA support"
  }'
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": 2,
    "name": "Updated SDXL Workflow",
    "description": "Enhanced SDXL workflow with LoRA support",
    "updated_at": "2025-01-16T11:30:00Z"
  }
}
```

### Delete a Workflow (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/workflows/2 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow deleted successfully"
}
```

### Assign Workflow to Container

```bash
curl -X POST http://localhost:3000/api/workflows/1/assign/abc123def456
```

**Response:**
```json
{
  "success": true,
  "message": "Workflow assigned to container successfully",
  "container": {
    "id": "abc123def456",
    "workflow_id": 1
  }
}
```

---

## Job Management

Submit, track, and manage AI generation jobs.

### Create a Job (Requires API Key)

#### Basic Text-to-Image Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "parameters": {
      "prompt": "a majestic dragon flying over mountains, fantasy art, highly detailed",
      "width": 1024,
      "height": 768,
      "steps": 4,
      "seed": -1
    }
  }'
```

#### Job with Priority

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "priority": 10,
    "parameters": {
      "prompt": "urgent: company logo design",
      "width": 512,
      "height": 512
    }
  }'
```

#### Job with Callback Webhook

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "callback_url": "https://your-app.com/webhook/job-complete",
    "parameters": {
      "prompt": "sunset landscape",
      "width": 1024,
      "height": 768
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": 123,
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_id": 1,
    "status": "queued",
    "priority": 0,
    "created_at": "2025-01-16T10:30:00Z"
  }
}
```

### Get Job Status

```bash
curl http://localhost:3000/api/jobs/123 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "id": 123,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "workflow_id": 1,
  "workflow_name": "FLUX.1 Schnell",
  "container_id": 2,
  "container_name": "comfyui-instance-1",
  "status": "completed",
  "priority": 0,
  "parameters": {
    "prompt": "sunset landscape",
    "width": 1024,
    "height": 768
  },
  "progress": 100,
  "output_image_url": "http://localhost:3000/api/media/1234567890-abc.png",
  "error_message": null,
  "created_at": "2025-01-16T10:30:00Z",
  "started_at": "2025-01-16T10:30:05Z",
  "completed_at": "2025-01-16T10:31:00Z"
}
```

### List All Jobs (Paginated)

```bash
# Basic list
curl http://localhost:3000/api/jobs?limit=50&offset=0 \
  -H "X-API-Key: your_api_key_here"

# Filter by status
curl http://localhost:3000/api/jobs?status=completed&limit=50 \
  -H "X-API-Key: your_api_key_here"

# Filter by workflow
curl http://localhost:3000/api/jobs?workflow_id=1&limit=50 \
  -H "X-API-Key: your_api_key_here"

# Multiple filters
curl "http://localhost:3000/api/jobs?status=completed&workflow_id=1&limit=50&offset=0" \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": 123,
      "workflow_id": 1,
      "workflow_name": "FLUX.1 Schnell",
      "status": "completed",
      "progress": 100,
      "created_at": "2025-01-16T10:30:00Z"
    }
  ],
  "stats": {
    "total": 150,
    "completed": 120,
    "failed": 5,
    "processing": 2,
    "pending": 23,
    "byStatus": {
      "completed": 120,
      "failed": 5,
      "processing": 2,
      "queued": 23
    }
  },
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### Get Job Queue

```bash
curl http://localhost:3000/api/jobs/queue \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "queue": [
    {
      "id": 124,
      "workflow_id": 1,
      "priority": 10,
      "status": "queued",
      "created_at": "2025-01-16T10:35:00Z"
    },
    {
      "id": 125,
      "workflow_id": 2,
      "priority": 0,
      "status": "queued",
      "created_at": "2025-01-16T10:36:00Z"
    }
  ],
  "stats": {
    "total_queued": 2,
    "total_processing": 1
  }
}
```

### Cancel a Job

```bash
curl -X POST http://localhost:3000/api/jobs/123/cancel \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "job": {
    "id": 123,
    "status": "cancelled"
  }
}
```

### Retry a Failed Job

```bash
curl -X POST http://localhost:3000/api/jobs/123/retry \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Job requeued for retry",
  "job": {
    "id": 126,
    "original_job_id": 123,
    "status": "queued"
  }
}
```

### Get Job Processor Statistics

```bash
curl http://localhost:3000/api/jobs/stats/processor \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_processed": 1523,
    "successful": 1450,
    "failed": 73,
    "average_processing_time_ms": 55000,
    "jobs_per_hour": 27.6,
    "queue_depth": 5,
    "active_containers": 3
  }
}
```

### Cleanup Old Jobs (Admin Only)

```bash
# Delete jobs older than 7 days
curl -X DELETE "http://localhost:3000/api/jobs/cleanup?days=7" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Delete jobs older than 30 days
curl -X DELETE "http://localhost:3000/api/jobs/cleanup?days=30" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Deleted 450 old jobs",
  "deleted_count": 450
}
```

---

## Advanced Jobs

### Batch Jobs

Submit multiple jobs in a single request for batch processing.

#### Create a Batch Job

```bash
curl -X POST http://localhost:3000/api/advanced-jobs/batch \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "batch_name": "Product Photo Batch",
    "jobs": [
      {
        "parameters": {
          "prompt": "red product on white background, professional photography",
          "width": 1024,
          "height": 1024
        },
        "priority": 1
      },
      {
        "parameters": {
          "prompt": "blue product on white background, professional photography",
          "width": 1024,
          "height": 1024
        },
        "priority": 1
      },
      {
        "parameters": {
          "prompt": "green product on white background, professional photography",
          "width": 1024,
          "height": 1024
        },
        "priority": 2
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "batch": {
    "batch_id": "batch_1234567890",
    "batch_name": "Product Photo Batch",
    "total_jobs": 3,
    "job_ids": [127, 128, 129],
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

#### Get Batch Status

```bash
curl http://localhost:3000/api/advanced-jobs/batch/batch_1234567890 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "batch": {
    "batch_id": "batch_1234567890",
    "batch_name": "Product Photo Batch",
    "total_jobs": 3,
    "completed_jobs": 2,
    "failed_jobs": 0,
    "pending_jobs": 1,
    "status": "processing",
    "jobs": [
      {
        "id": 127,
        "status": "completed",
        "output_image_url": "http://localhost:3000/api/media/img1.png"
      },
      {
        "id": 128,
        "status": "completed",
        "output_image_url": "http://localhost:3000/api/media/img2.png"
      },
      {
        "id": 129,
        "status": "processing",
        "progress": 45
      }
    ]
  }
}
```

#### Cancel a Batch

```bash
curl -X POST http://localhost:3000/api/advanced-jobs/batch/batch_1234567890/cancel \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Batch cancelled successfully",
  "cancelled_jobs": 1
}
```

### Scheduled Jobs

Create recurring jobs using cron expressions.

#### Create a Scheduled Job

```bash
# Daily at 2 AM
curl -X POST http://localhost:3000/api/advanced-jobs/scheduled \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "name": "Daily Report Generation",
    "cron_expression": "0 2 * * *",
    "parameters": {
      "prompt": "abstract landscape for daily report",
      "width": 1920,
      "height": 1080
    },
    "is_active": true,
    "timezone": "UTC"
  }'

# Every hour
curl -X POST http://localhost:3000/api/advanced-jobs/scheduled \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "name": "Hourly Image Generation",
    "cron_expression": "0 * * * *",
    "parameters": {
      "prompt": "random abstract art",
      "width": 512,
      "height": 512
    },
    "is_active": true
  }'
```

**Cron Expression Examples:**
- `0 2 * * *` - Daily at 2:00 AM
- `0 * * * *` - Every hour
- `*/15 * * * *` - Every 15 minutes
- `0 9-17 * * 1-5` - Every hour from 9 AM to 5 PM, Monday to Friday
- `0 0 * * 0` - Every Sunday at midnight

**Response:**
```json
{
  "success": true,
  "scheduled_job": {
    "id": 1,
    "name": "Daily Report Generation",
    "workflow_id": 1,
    "cron_expression": "0 2 * * *",
    "is_active": true,
    "next_run": "2025-01-17T02:00:00Z",
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

#### List Scheduled Jobs

```bash
curl http://localhost:3000/api/advanced-jobs/scheduled \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "scheduled_jobs": [
    {
      "id": 1,
      "name": "Daily Report Generation",
      "workflow_id": 1,
      "cron_expression": "0 2 * * *",
      "is_active": true,
      "last_run": "2025-01-16T02:00:00Z",
      "next_run": "2025-01-17T02:00:00Z",
      "total_runs": 45,
      "failed_runs": 2
    }
  ]
}
```

#### Get Specific Scheduled Job

```bash
curl http://localhost:3000/api/advanced-jobs/scheduled/1 \
  -H "X-API-Key: your_api_key_here"
```

#### Update Scheduled Job

```bash
curl -X PUT http://localhost:3000/api/advanced-jobs/scheduled/1 \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false,
    "cron_expression": "0 3 * * *"
  }'
```

**Response:**
```json
{
  "success": true,
  "scheduled_job": {
    "id": 1,
    "is_active": false,
    "cron_expression": "0 3 * * *",
    "next_run": "2025-01-17T03:00:00Z",
    "updated_at": "2025-01-16T11:30:00Z"
  }
}
```

#### Delete Scheduled Job

```bash
curl -X DELETE http://localhost:3000/api/advanced-jobs/scheduled/1 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Scheduled job deleted successfully"
}
```

### Job Templates

Create reusable job templates for common workflows.

#### Create a Job Template

```bash
curl -X POST http://localhost:3000/api/advanced-jobs/templates \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Photo Template",
    "description": "Standard product photography settings",
    "workflow_id": 1,
    "default_parameters": {
      "width": 1024,
      "height": 1024,
      "steps": 20,
      "cfg_scale": 7.5
    },
    "parameter_schema": {
      "prompt": {
        "type": "string",
        "required": true,
        "description": "Product description"
      },
      "background_color": {
        "type": "string",
        "enum": ["white", "black", "gradient"],
        "default": "white"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "template": {
    "id": 1,
    "name": "Product Photo Template",
    "workflow_id": 1,
    "default_parameters": { ... },
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

#### List Job Templates

```bash
curl http://localhost:3000/api/advanced-jobs/templates \
  -H "X-API-Key: your_api_key_here"
```

#### Use a Template to Create Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": 1,
    "parameters": {
      "prompt": "red sneaker, side view",
      "background_color": "white"
    }
  }'
```

---

## Media & Storage

### Download Generated Media

```bash
# Download image
curl http://localhost:3000/api/media/1234567890-abc.png -o result.png

# Download video
curl http://localhost:3000/api/media/video_1234567890.mp4 -o result.mp4

# Download with authentication (if required)
curl http://localhost:3000/api/media/1234567890-abc.png \
  -H "X-API-Key: your_api_key_here" \
  -o result.png
```

### Get Storage Statistics

```bash
curl http://localhost:3000/api/media/stats/storage
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "fileCount": 1523,
    "totalSize": 15234567890,
    "totalSizeMB": "14532.45",
    "totalSizeGB": "14.19",
    "storageType": "local",
    "storagePath": "/app/output",
    "oldestFile": "2024-12-01T10:00:00Z",
    "newestFile": "2025-01-16T11:30:00Z"
  }
}
```

---

## Health & Monitoring

### Basic Health Check

```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-01-16T10:30:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "healthy",
    "responseTime": 2
  },
  "docker": {
    "status": "healthy",
    "containers": 3,
    "running": 2
  },
  "memory": {
    "rss": 52428800,
    "heapTotal": 41943040,
    "heapUsed": 21504256,
    "percentUsed": "51.28"
  },
  "version": "1.0.0"
}
```

### Detailed Health Check

```bash
curl http://localhost:3000/api/health/detailed
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 2,
      "connections": {
        "total": 20,
        "idle": 18,
        "waiting": 0
      }
    },
    "docker": {
      "status": "healthy",
      "responseTime": 5,
      "containers": {
        "total": 3,
        "running": 2,
        "stopped": 1
      },
      "version": "24.0.0"
    },
    "storage": {
      "status": "healthy",
      "available_space_gb": 250.5,
      "used_space_gb": 14.2,
      "total_files": 1523
    },
    "gpu": {
      "status": "healthy",
      "devices": [
        {
          "id": 0,
          "name": "NVIDIA GeForce RTX 4090",
          "memory_total": 24576,
          "memory_used": 8192,
          "utilization": 45
        }
      ]
    }
  }
}
```

### Kubernetes Readiness Probe

```bash
curl http://localhost:3000/api/health/ready
```

**Response (200 OK):**
```json
{
  "status": "ready"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "reason": "database_unavailable"
}
```

### Kubernetes Liveness Probe

```bash
curl http://localhost:3000/api/health/live
```

**Response:**
```json
{
  "status": "alive"
}
```

### Prometheus Metrics

```bash
curl http://localhost:3000/api/health/metrics
```

**Response (Prometheus format):**
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/jobs",status="200"} 1523

# HELP job_processing_duration_seconds Job processing duration
# TYPE job_processing_duration_seconds histogram
job_processing_duration_seconds_bucket{le="30"} 145
job_processing_duration_seconds_bucket{le="60"} 1200
job_processing_duration_seconds_sum 82500
job_processing_duration_seconds_count 1523

# HELP active_containers Number of active containers
# TYPE active_containers gauge
active_containers 3

# HELP gpu_utilization_percent GPU utilization percentage
# TYPE gpu_utilization_percent gauge
gpu_utilization_percent{device="0"} 45.2
```

### Custom Metrics (JSON)

```bash
curl http://localhost:3000/api/health/metrics/custom
```

**Response:**
```json
{
  "http": {
    "requests_total": 152345,
    "requests_by_status": {
      "200": 145000,
      "400": 2000,
      "401": 500,
      "404": 1000,
      "500": 345
    },
    "avg_response_time_ms": 125
  },
  "jobs": {
    "total_processed": 1523,
    "successful": 1450,
    "failed": 73,
    "avg_duration_seconds": 54.2,
    "jobs_per_hour": 27.6
  },
  "containers": {
    "active": 3,
    "total_created": 15,
    "avg_uptime_hours": 48.5
  },
  "gpu": {
    "devices": 1,
    "avg_utilization_percent": 45.2,
    "avg_memory_used_mb": 8192
  }
}
```

### Get Application Logs

```bash
# Get last 100 logs
curl "http://localhost:3000/api/health/logs?limit=100"

# Filter by log level
curl "http://localhost:3000/api/health/logs?limit=100&level=error"

# Filter by time range
curl "http://localhost:3000/api/health/logs?from=2025-01-16T00:00:00Z&to=2025-01-16T23:59:59Z"
```

**Response:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-16T10:30:00.000Z",
      "level": "info",
      "message": "Job 123 completed successfully",
      "metadata": {
        "jobId": 123,
        "duration": 55000
      }
    },
    {
      "timestamp": "2025-01-16T10:29:00.000Z",
      "level": "error",
      "message": "Failed to process job 122",
      "metadata": {
        "jobId": 122,
        "error": "Out of memory"
      }
    }
  ],
  "pagination": {
    "total": 5000,
    "limit": 100,
    "offset": 0
  }
}
```

### Clear Logs (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/health/logs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Logs cleared successfully",
  "deleted_count": 5000
}
```

---

## Authentication & User Management

### Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 100
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Get Current User Profile

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "credits": 85,
    "created_at": "2025-01-16T10:00:00Z",
    "stats": {
      "total_jobs": 15,
      "successful_jobs": 14,
      "failed_jobs": 1
    }
  }
}
```

---

## Admin APIs

### API Key Management

#### Create API Key (Admin Only)

```bash
curl -X POST http://localhost:3000/api/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bot@example.com",
    "name": "Production Bot",
    "permissions": [
      "jobs:create",
      "jobs:read",
      "jobs:update",
      "containers:read",
      "workflows:read"
    ],
    "rateLimit": 1000,
    "expiresAt": "2026-01-16T10:00:00Z"
  }'
```

**Response:**
```json
{
  "success": true,
  "apiKey": {
    "id": 1,
    "key": "sk_prod_1234567890abcdef1234567890abcdef",
    "keyPrefix": "sk_prod_1234",
    "email": "bot@example.com",
    "name": "Production Bot",
    "permissions": ["jobs:create", "jobs:read", ...],
    "rateLimit": 1000,
    "expiresAt": "2026-01-16T10:00:00Z",
    "createdAt": "2025-01-16T11:00:00Z"
  },
  "warning": "This API key will only be displayed once. Please store it securely."
}
```

#### List API Keys (Admin Only)

```bash
curl http://localhost:3000/api/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "apiKeys": [
    {
      "id": 1,
      "keyPrefix": "sk_prod_1234",
      "email": "bot@example.com",
      "name": "Production Bot",
      "permissions": ["jobs:create", "jobs:read"],
      "rateLimit": 1000,
      "lastUsedAt": "2025-01-16T10:30:00Z",
      "expiresAt": "2026-01-16T10:00:00Z",
      "createdAt": "2025-01-16T11:00:00Z"
    }
  ]
}
```

#### Get API Key Details (Admin Only)

```bash
curl http://localhost:3000/api/admin/api-keys/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Revoke API Key (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/admin/api-keys/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

### User Management

#### List All Users (Admin Only)

```bash
curl http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 85,
      "createdAt": "2025-01-16T10:00:00Z",
      "stats": {
        "totalJobs": 15,
        "successfulJobs": 14
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

#### Get User Details (Admin Only)

```bash
curl http://localhost:3000/api/admin/users/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Update User (Admin Only)

```bash
curl -X PUT http://localhost:3000/api/admin/users/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin",
    "credits": 200
  }'
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "credits": 200,
    "updatedAt": "2025-01-16T11:30:00Z"
  }
}
```

#### Delete User (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/admin/users/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

#### Adjust User Credits (Admin Only)

```bash
# Add credits
curl -X POST http://localhost:3000/api/admin/users/1/credits \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50,
    "operation": "add",
    "reason": "Promotional credits"
  }'

# Subtract credits
curl -X POST http://localhost:3000/api/admin/users/1/credits \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10,
    "operation": "subtract",
    "reason": "Refund processing"
  }'
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "credits": 135,
    "previousCredits": 85
  },
  "transaction": {
    "amount": 50,
    "operation": "add",
    "reason": "Promotional credits",
    "timestamp": "2025-01-16T11:00:00Z"
  }
}
```

---

## GPU Management

### List All GPUs

```bash
curl http://localhost:3000/api/gpu \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "gpus": [
    {
      "id": 0,
      "name": "NVIDIA GeForce RTX 4090",
      "uuid": "GPU-12345678-1234-1234-1234-123456789012",
      "memory_total_mb": 24576,
      "memory_used_mb": 8192,
      "memory_free_mb": 16384,
      "utilization_percent": 45,
      "temperature_celsius": 65,
      "power_usage_watts": 350,
      "allocated_to": "comfyui-instance-1",
      "status": "active"
    }
  ]
}
```

### Get GPU Details

```bash
curl http://localhost:3000/api/gpu/0 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "gpu": {
    "id": 0,
    "name": "NVIDIA GeForce RTX 4090",
    "uuid": "GPU-12345678-1234-1234-1234-123456789012",
    "memory_total_mb": 24576,
    "memory_used_mb": 8192,
    "utilization_percent": 45,
    "temperature_celsius": 65,
    "processes": [
      {
        "pid": 12345,
        "name": "python",
        "memory_mb": 8192,
        "container_id": "abc123def456"
      }
    ]
  }
}
```

### Allocate GPU to Container (Admin Only)

```bash
curl -X POST http://localhost:3000/api/gpu/allocate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gpu_id": 0,
    "container_id": "abc123def456"
  }'
```

**Response:**
```json
{
  "success": true,
  "allocation": {
    "gpu_id": 0,
    "container_id": "abc123def456",
    "allocated_at": "2025-01-16T11:00:00Z"
  }
}
```

### Release GPU Allocation (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/gpu/0/release \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "GPU allocation released successfully"
}
```

---

## Container Pools & Auto-Scaling

### Create Container Pool (Admin Only)

```bash
curl -X POST http://localhost:3000/api/container-pools \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Pool",
    "workflow_id": 1,
    "min_containers": 2,
    "max_containers": 10,
    "target_queue_depth": 5,
    "scale_up_threshold": 3,
    "scale_down_threshold": 1,
    "idle_timeout_minutes": 30,
    "gpu_required": true
  }'
```

**Response:**
```json
{
  "success": true,
  "pool": {
    "id": 1,
    "name": "Production Pool",
    "workflow_id": 1,
    "min_containers": 2,
    "max_containers": 10,
    "current_containers": 2,
    "target_queue_depth": 5,
    "status": "active",
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

### List Container Pools

```bash
curl http://localhost:3000/api/container-pools \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "pools": [
    {
      "id": 1,
      "name": "Production Pool",
      "workflow_id": 1,
      "min_containers": 2,
      "max_containers": 10,
      "current_containers": 5,
      "queue_depth": 7,
      "status": "scaling_up",
      "last_scaled_at": "2025-01-16T10:45:00Z"
    }
  ]
}
```

### Get Pool Details

```bash
curl http://localhost:3000/api/container-pools/1 \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "pool": {
    "id": 1,
    "name": "Production Pool",
    "workflow_id": 1,
    "min_containers": 2,
    "max_containers": 10,
    "current_containers": 5,
    "queue_depth": 7,
    "status": "active",
    "containers": [
      {
        "id": "abc123",
        "status": "running",
        "jobs_processed": 45,
        "current_job": 123
      },
      {
        "id": "def456",
        "status": "running",
        "jobs_processed": 38,
        "current_job": null
      }
    ],
    "scaling_events": [
      {
        "timestamp": "2025-01-16T10:45:00Z",
        "event": "scaled_up",
        "from": 4,
        "to": 5,
        "reason": "queue_depth_exceeded"
      }
    ]
  }
}
```

### Update Pool Configuration (Admin Only)

```bash
curl -X PUT http://localhost:3000/api/container-pools/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "max_containers": 15,
    "target_queue_depth": 10,
    "idle_timeout_minutes": 45
  }'
```

**Response:**
```json
{
  "success": true,
  "pool": {
    "id": 1,
    "max_containers": 15,
    "target_queue_depth": 10,
    "idle_timeout_minutes": 45,
    "updated_at": "2025-01-16T11:30:00Z"
  }
}
```

### Delete Container Pool (Admin Only)

```bash
curl -X DELETE http://localhost:3000/api/container-pools/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Container pool deleted successfully",
  "containers_stopped": 5
}
```

---

## Specialized AI Models

### InfiniteTalk - Video Lip-Sync

Generate lip-synced videos from images and audio.

#### Create Lip-Sync Job (Image + Audio URL)

```bash
curl -X POST http://localhost:3000/api/v1/infinitetalk \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/portrait.jpg",
    "audio_url": "https://example.com/speech.wav",
    "resolution": "720p",
    "seed": 42,
    "workflow_id": 3,
    "callback_url": "https://your-app.com/webhook/infinitetalk-complete"
  }'
```

#### Create Lip-Sync Job (Base64 Encoded)

```bash
curl -X POST http://localhost:3000/api/v1/infinitetalk \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "audio_base64": "data:audio/wav;base64,UklGRiQAAABXQVZF...",
    "resolution": "720p",
    "seed": -1
  }'
```

**Parameters:**
- `resolution`: `"480p"` or `"720p"`
- `seed`: Random seed (-1 for random)
- `workflow_id`: ID of InfiniteTalk workflow (default: 3)
- `callback_url`: Optional webhook URL for completion notification

**Response:**
```json
{
  "success": true,
  "job": {
    "id": 150,
    "model": "infinitetalk",
    "status": "queued",
    "parameters": {
      "resolution": "720p",
      "seed": 42
    },
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

### WAN 2.2 - Video Animation

Generate animated videos from static images.

#### Create Video Animation Job

```bash
curl -X POST http://localhost:3000/api/v1/wan \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/landscape.jpg",
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "duration": 5,
    "motion_intensity": 0.7,
    "seed": 42,
    "workflow_id": 4,
    "callback_url": "https://your-app.com/webhook/wan-complete"
  }'
```

#### Using Base64 Image

```bash
curl -X POST http://localhost:3000/api/v1/wan \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "duration": 3,
    "motion_intensity": 0.5,
    "seed": -1
  }'
```

**Parameters:**
- `resolution`: `"480p"`, `"580p"`, or `"720p"`
- `aspect_ratio`: `"16:9"`, `"4:3"`, `"1:1"`, etc.
- `duration`: Video length in seconds (1-10)
- `motion_intensity`: Motion strength (0.0-1.0)
- `seed`: Random seed (-1 for random)

**Response:**
```json
{
  "success": true,
  "job": {
    "id": 151,
    "model": "wan2.2",
    "status": "queued",
    "parameters": {
      "resolution": "720p",
      "duration": 5,
      "motion_intensity": 0.7
    },
    "estimated_completion": "2025-01-16T11:05:00Z",
    "created_at": "2025-01-16T11:00:00Z"
  }
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "workflow_id is required",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "details": {
      "field": "workflow_id",
      "constraint": "required"
    }
  }
}
```

### HTTP Status Codes

| Code | Description | Example |
|------|-------------|---------|
| `200` | Success | Job created, data retrieved |
| `201` | Created | New resource created |
| `400` | Bad Request | Invalid parameters, validation failed |
| `401` | Unauthorized | Missing or invalid API key/token |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate resource (e.g., email exists) |
| `422` | Unprocessable Entity | Validation error with details |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | Database or Docker unavailable |

### Common Error Codes

#### Authentication Errors

```bash
# Missing API key
curl http://localhost:3000/api/jobs

# Response (401)
{
  "success": false,
  "error": {
    "code": "unauthorized",
    "message": "API key is required",
    "requestId": "..."
  }
}
```

```bash
# Invalid API key
curl http://localhost:3000/api/jobs \
  -H "X-API-Key: invalid_key"

# Response (401)
{
  "success": false,
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid or expired API key",
    "requestId": "..."
  }
}
```

#### Validation Errors

```bash
# Missing required field
curl -X POST http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "prompt": "test"
    }
  }'

# Response (400)
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "workflow_id is required",
    "details": {
      "field": "workflow_id",
      "constraint": "required"
    }
  }
}
```

#### Resource Not Found

```bash
# Non-existent job
curl http://localhost:3000/api/jobs/99999 \
  -H "X-API-Key: your_api_key_here"

# Response (404)
{
  "success": false,
  "error": {
    "code": "not_found",
    "message": "Job not found",
    "requestId": "..."
  }
}
```

#### Rate Limit Errors

```bash
# Response (429)
{
  "success": false,
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "retryAfter": 60,
    "limit": 100,
    "remaining": 0,
    "resetAt": "2025-01-16T11:15:00Z"
  }
}
```

---

## Rate Limiting

### Default Rate Limits

- **General API**: 100 requests per 15 minutes per IP/API key
- **Job Creation**: 10 requests per minute per IP/API key
- **Admin APIs**: 1000 requests per hour

### Rate Limit Headers

Every response includes rate limit information:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642339200
```

### Checking Rate Limit Status

```bash
curl -I http://localhost:3000/api/jobs \
  -H "X-API-Key: your_api_key_here"
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642339200
X-RateLimit-Window: 900
```

### Custom Rate Limits for API Keys

Admin can set custom rate limits when creating API keys:

```bash
curl -X POST http://localhost:3000/api/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "premium@example.com",
    "name": "Premium Account",
    "rateLimit": 10000
  }'
```

---

## Webhooks & Callbacks

### Job Completion Webhook

When creating a job with `callback_url`, the API will send a POST request when the job completes.

#### Webhook Payload (Success)

```json
POST https://your-app.com/webhook/job-complete
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...

{
  "event": "job.completed",
  "timestamp": "2025-01-16T11:01:00Z",
  "job": {
    "id": 123,
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_id": 1,
    "workflow_name": "FLUX.1 Schnell",
    "status": "completed",
    "parameters": {
      "prompt": "sunset landscape",
      "width": 1024,
      "height": 768
    },
    "output_image_url": "http://localhost:3000/api/media/1234567890-abc.png",
    "created_at": "2025-01-16T10:30:00Z",
    "started_at": "2025-01-16T10:30:05Z",
    "completed_at": "2025-01-16T10:31:00Z",
    "duration_seconds": 55
  }
}
```

#### Webhook Payload (Failure)

```json
POST https://your-app.com/webhook/job-complete
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...

{
  "event": "job.failed",
  "timestamp": "2025-01-16T11:01:00Z",
  "job": {
    "id": 123,
    "status": "failed",
    "error_message": "Out of memory during processing",
    "error_code": "OOM_ERROR",
    "created_at": "2025-01-16T10:30:00Z",
    "failed_at": "2025-01-16T10:31:00Z"
  }
}
```

### Verifying Webhook Signatures

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' +
    crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express middleware example
app.post('/webhook/job-complete', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const isValid = verifyWebhookSignature(
    req.body,
    signature,
    process.env.WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook
  const { event, job } = req.body;
  console.log(`Job ${job.id} ${event}`);

  res.json({ received: true });
});
```

### Webhook Retry Logic

- **Retry attempts**: Up to 3 times
- **Retry schedule**: Exponential backoff (1s, 2s, 4s)
- **Timeout**: 10 seconds per attempt
- **Success criteria**: HTTP 200-299 response

---

## Complete Workflow Examples

### Example 1: Simple Image Generation

```bash
#!/bin/bash

API_KEY="your_api_key_here"
BASE_URL="http://localhost:3000/api"

# 1. Check health
echo "Checking system health..."
curl -s "$BASE_URL/health" | jq .

# 2. List workflows
echo -e "\nListing available workflows..."
WORKFLOW_ID=$(curl -s "$BASE_URL/workflows" | jq -r '.workflows[0].id')
echo "Using workflow ID: $WORKFLOW_ID"

# 3. Create job
echo -e "\nCreating job..."
JOB_RESPONSE=$(curl -s -X POST "$BASE_URL/jobs" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"workflow_id\": $WORKFLOW_ID,
    \"parameters\": {
      \"prompt\": \"a serene mountain landscape at sunset\",
      \"width\": 1024,
      \"height\": 768,
      \"steps\": 4
    }
  }")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job.id')
echo "Job created with ID: $JOB_ID"

# 4. Poll for completion
echo -e "\nWaiting for job to complete..."
while true; do
  STATUS=$(curl -s "$BASE_URL/jobs/$JOB_ID" \
    -H "X-API-Key: $API_KEY" | jq -r '.status')

  echo "Status: $STATUS"

  if [ "$STATUS" == "completed" ]; then
    break
  elif [ "$STATUS" == "failed" ]; then
    echo "Job failed!"
    exit 1
  fi

  sleep 2
done

# 5. Download result
echo -e "\nDownloading result..."
IMAGE_URL=$(curl -s "$BASE_URL/jobs/$JOB_ID" \
  -H "X-API-Key: $API_KEY" | jq -r '.output_image_url')

curl -s "$IMAGE_URL" -o result.png
echo "Image saved to result.png"
```

### Example 2: Batch Processing with Progress Tracking

```bash
#!/bin/bash

API_KEY="your_api_key_here"
BASE_URL="http://localhost:3000/api"

# Create batch job
BATCH_RESPONSE=$(curl -s -X POST "$BASE_URL/advanced-jobs/batch" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "batch_name": "Landscape Collection",
    "jobs": [
      {
        "parameters": {
          "prompt": "mountain landscape",
          "width": 1024,
          "height": 768
        }
      },
      {
        "parameters": {
          "prompt": "ocean landscape",
          "width": 1024,
          "height": 768
        }
      },
      {
        "parameters": {
          "prompt": "forest landscape",
          "width": 1024,
          "height": 768
        }
      }
    ]
  }')

BATCH_ID=$(echo $BATCH_RESPONSE | jq -r '.batch.batch_id')
echo "Batch created: $BATCH_ID"

# Monitor progress
while true; do
  BATCH_STATUS=$(curl -s "$BASE_URL/advanced-jobs/batch/$BATCH_ID" \
    -H "X-API-Key: $API_KEY")

  COMPLETED=$(echo $BATCH_STATUS | jq -r '.batch.completed_jobs')
  TOTAL=$(echo $BATCH_STATUS | jq -r '.batch.total_jobs')

  echo "Progress: $COMPLETED/$TOTAL"

  if [ "$COMPLETED" == "$TOTAL" ]; then
    echo "Batch complete!"
    break
  fi

  sleep 5
done

# Download all results
echo $BATCH_STATUS | jq -r '.batch.jobs[].output_image_url' | while read url; do
  FILENAME=$(basename "$url")
  curl -s "$url" -o "$FILENAME"
  echo "Downloaded: $FILENAME"
done
```

### Example 3: Scheduled Daily Job

```bash
#!/bin/bash

API_KEY="your_api_key_here"
BASE_URL="http://localhost:3000/api"

# Create scheduled job that runs daily at 2 AM
curl -X POST "$BASE_URL/advanced-jobs/scheduled" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 1,
    "name": "Daily Report Header Image",
    "cron_expression": "0 2 * * *",
    "parameters": {
      "prompt": "professional business report header, modern design",
      "width": 1920,
      "height": 400
    },
    "is_active": true,
    "callback_url": "https://your-app.com/webhook/scheduled-job-complete"
  }' | jq .
```

### Example 4: Video Lip-Sync Generation

```bash
#!/bin/bash

API_KEY="your_api_key_here"
BASE_URL="http://localhost:3000/api"

# Create lip-sync job
JOB_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/infinitetalk" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/portrait.jpg",
    "audio_url": "https://example.com/speech.wav",
    "resolution": "720p",
    "seed": -1,
    "callback_url": "https://your-app.com/webhook/lipsync-complete"
  }')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job.id')
echo "Lip-sync job created: $JOB_ID"

# Monitor progress
while true; do
  JOB_STATUS=$(curl -s "$BASE_URL/jobs/$JOB_ID" \
    -H "X-API-Key: $API_KEY")

  STATUS=$(echo $JOB_STATUS | jq -r '.status')
  PROGRESS=$(echo $JOB_STATUS | jq -r '.progress')

  echo "Status: $STATUS, Progress: $PROGRESS%"

  if [ "$STATUS" == "completed" ]; then
    VIDEO_URL=$(echo $JOB_STATUS | jq -r '.output_image_url')
    curl -s "$VIDEO_URL" -o lipsync_result.mp4
    echo "Video saved to lipsync_result.mp4"
    break
  elif [ "$STATUS" == "failed" ]; then
    echo "Job failed: $(echo $JOB_STATUS | jq -r '.error_message')"
    exit 1
  fi

  sleep 5
done
```

---

## Troubleshooting

### Common Issues

#### Issue: "Database connection failed"

```bash
# Check database health
curl http://localhost:3000/api/health/detailed | jq '.components.database'

# Expected response if healthy:
{
  "status": "healthy",
  "responseTime": 2,
  "connections": {
    "total": 20,
    "idle": 18
  }
}
```

#### Issue: "Docker daemon not accessible"

```bash
# Check Docker health
curl http://localhost:3000/api/health/detailed | jq '.components.docker'

# Verify Docker socket permissions
ls -la /var/run/docker.sock
```

#### Issue: "Container failed to start"

```bash
# Get container logs
CONTAINER_ID="abc123def456"
curl "http://localhost:3000/api/containers/$CONTAINER_ID/logs?tail=100"

# Check container status
curl "http://localhost:3000/api/containers/$CONTAINER_ID"
```

#### Issue: "Job stuck in 'queued' status"

```bash
# Check queue depth
curl http://localhost:3000/api/jobs/queue \
  -H "X-API-Key: your_api_key_here" | jq '.stats'

# Check processor stats
curl http://localhost:3000/api/jobs/stats/processor \
  -H "X-API-Key: your_api_key_here"

# Check container availability
curl http://localhost:3000/api/containers | jq '[.containers[] | select(.status=="running")]'
```

---

## Support & Resources

### Documentation

- **API Reference**: This document
- **Build Instructions**: `BUILD.md`
- **Features Overview**: `FEATURES.md`
- **Workflow Integration**: `WORKFLOW_INTEGRATION.md`

### Getting Help

1. Check application logs:
   ```bash
   curl "http://localhost:3000/api/health/logs?limit=100&level=error"
   ```

2. Review system health:
   ```bash
   curl http://localhost:3000/api/health/detailed
   ```

3. Check Prometheus metrics:
   ```bash
   curl http://localhost:3000/api/health/metrics
   ```

### Environment Configuration

Key environment variables:

```bash
# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=comfyui
DB_USER=comfyui
DB_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=production

# Docker
DOCKER_HOST=unix:///var/run/docker.sock
VOLUME_BASE=/path/to/project

# GPU
NVIDIA_VISIBLE_DEVICES=all

# Security
JWT_SECRET=your_jwt_secret
WEBHOOK_SECRET=your_webhook_secret
```

---

## Version History

- **v1.0.0** (2025-01-16) - Initial release
  - Container management APIs
  - Job queue system
  - Batch and scheduled jobs
  - GPU management
  - Auto-scaling container pools
  - Health monitoring and metrics
  - Authentication and RBAC
  - InfiniteTalk and WAN 2.2 integrations

---

**Last Updated**: 2025-01-16
**API Version**: 1.0.0
**Base URL**: `http://localhost:3000/api`
