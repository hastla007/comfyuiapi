# Code Locations Reference

## Key Files for Container Load Tracking

### 1. Database Schema
**File**: `/home/user/comfyuiapi/backend/src/database.js`
- Lines 64-76: Container table definition
- **Missing**: active_job_count, max_concurrent_jobs, health_status fields

**File**: `/home/user/comfyuiapi/backend/src/migrations/comprehensive-features.sql`
- Lines 139-166: Container pool definitions
- Lines 140-151: Container pools table (min_containers, max_containers, scale_up_threshold)
- Lines 154-155: Container pool fields (pool_id, last_activity_at)
- **Note**: Pool-level configuration, not per-container

### 2. Job Assignment Logic (CRITICAL)
**File**: `/home/user/comfyuiapi/backend/src/services/jobProcessor.js`

#### Container Selection
- **Lines 263-282**: `selectContainer()` function
  - **PROBLEM**: Selects first container by ID (ORDER BY id ASC LIMIT 1)
  - No load checking
  - No capacity validation
  - No health checking

```javascript
async selectContainer(preferredContainerId = null) {
  if (preferredContainerId) {
    // Use specific container
  }
  
  // Otherwise, find ANY running container (first by ID!)
  const result = await pool.query(
    `SELECT * FROM containers
     WHERE status = 'running'
     ORDER BY id ASC
     LIMIT 1`
  );
  return result.rows[0] || null;
}
```

#### Global Concurrent Job Limit
- **Lines 14-18**: `maxConcurrentJobs` definition
  - Hardcoded to 10 (global, not per-container)
  - Only tracked in memory: `this.processingJobs = new Map()`

- **Lines 62-66**: Job processing check
  - Checks global limit: `if (this.processingJobs.size >= this.maxConcurrentJobs)`

### 3. Container Monitoring
**File**: `/home/user/comfyuiapi/backend/src/services/containerMonitor.js`

#### What It Tracks
- **Lines 75-87**: `checkContainer()` function
  - Container status (running/stopped)
  - Health check results
  - Started/Finished timestamps
  - **Does NOT track active jobs**

#### Resource Metrics
- **Lines 153-211**: `parseStats()` function
  - CPU percentage
  - Memory usage
  - Network I/O
  - Block I/O
  - **Does NOT count active jobs**

### 4. Job Service (Job Creation & Tracking)
**File**: `/home/user/comfyuiapi/backend/src/services/jobService.js`

#### Job Status Updates
- **Lines 159-243**: `updateJobStatus()` function
  - Updates job status in database
  - Stores `container_id` if provided
  - **No automatic container load tracking**

#### Get Next Queued Job
- **Lines 338-359**: `getNextQueuedJob()` function
  - Orders by priority, then creation time
  - **No container load consideration**

### 5. Auto-Scaler Service
**File**: `/home/user/comfyuiapi/backend/src/services/autoScaler.js`

#### Scaling Logic
- **Lines 82-87**: Get queue depth (global)
  ```sql
  SELECT COUNT(*) as count FROM jobs WHERE status = 'queued'
  ```
  - **Only tracks queue depth, not per-container load**

- **Lines 90-98**: Check for idle containers
  - Uses `last_activity_at` timestamp
  - **Does NOT check actual job count per container**

#### Pool Metrics
- **Lines 291-327**: `getPoolMetrics()` function
  - Current container count
  - Idle container count
  - Queue depth
  - Processing jobs (global count)
  - **Used for auto-scaling, not for job assignment**

### 6. Jobs API Routes
**File**: `/home/user/comfyuiapi/backend/src/routes/jobs.js`

#### Job Creation
- **Lines 12-77**: POST /api/jobs
  - Accepts optional `container_id`
  - Validates container exists
  - **Does NOT check container load or capacity**

#### Queue Status
- **Lines 83-93**: GET /api/jobs/queue
  - Returns jobs in queue
  - Joins with container names
  - **No per-container load information returned**

### 7. Containers API Routes
**File**: `/home/user/comfyuiapi/backend/src/routes/containers.js`

#### List Containers
- **Lines 23-51**: GET /api/containers
  - Merges Docker and DB information
  - **Does NOT return active job counts**

#### Container Stats
- **Lines 391-400**: GET /api/containers/:id/stats
  - Returns container resource metrics
  - **Does NOT return active job counts**

### 8. Metrics Middleware
**File**: `/home/user/comfyuiapi/backend/src/middleware/metrics.js`

#### Available Metrics
- **Lines 39-42**: `activeJobs` gauge
  - Tracks total active jobs system-wide
  - **Not per-container**

- **Lines 44-47**: `queueLength` gauge
  - System-wide queue depth
  - **Not per-container**

- **Lines 49-53**: `containersTotal` gauge
  - Container count by status
  - **No per-container capacity tracking**

---

## Database Queries - Current State

### Jobs linked to Containers
```sql
-- From jobs table
SELECT * FROM jobs WHERE container_id = $1;

-- From jobProcessor.js line 87-102
UPDATE jobs SET status = 'processing'
WHERE id = (SELECT id FROM jobs 
            WHERE status = 'queued'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1)
RETURNING *;
```

**Issue**: No count of active jobs per container query exists

### Container Selection Query
```sql
-- Current (jobProcessor.js line 274-278)
SELECT * FROM containers
WHERE status = 'running'
ORDER BY id ASC
LIMIT 1;

-- What's needed:
SELECT c.*, COUNT(j.id) as active_job_count
FROM containers c
LEFT JOIN jobs j ON c.id = j.container_id 
  AND j.status = 'processing'
WHERE c.status = 'running'
GROUP BY c.id
HAVING COUNT(j.id) < c.max_concurrent_jobs
ORDER BY COUNT(j.id) ASC
LIMIT 1;
```

### Queue Depth Query (Auto-Scaler)
```sql
-- Current (autoScaler.js line 82-84)
SELECT COUNT(*) as count FROM jobs WHERE status = 'queued';

-- What's needed per-container:
SELECT 
  container_id,
  COUNT(*) as queue_depth,
  SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as active_count
FROM jobs
WHERE container_id IS NOT NULL
GROUP BY container_id;
```

---

## Missing Code/Features

### 1. Container Capacity Table
**Location**: Should be in migrations/comprehensive-features.sql
**Status**: Not implemented
**Needed**: 
```sql
ALTER TABLE containers ADD COLUMN max_concurrent_jobs INTEGER DEFAULT 3;
ALTER TABLE containers ADD COLUMN current_job_count INTEGER DEFAULT 0;
ALTER TABLE containers ADD COLUMN supported_models JSONB;
ALTER TABLE containers ADD COLUMN health_status VARCHAR(50) DEFAULT 'healthy';
```

### 2. Container Active Jobs Tracking
**Location**: Should be in services/jobProcessor.js
**Status**: Only in-memory Map, not in database
**Needed**: Update container.current_job_count when jobs start/complete

### 3. Load-Aware Container Selection
**Location**: /backend/src/services/jobProcessor.js - `selectContainer()` method
**Status**: Not implemented
**Current Code**: Lines 263-282
**Needs**: Replace with least-loaded algorithm

### 4. Container Health Scoring
**Location**: Should be in containerMonitor.js
**Status**: Not implemented
**Needed**: Calculate health score from:
- Job success rate
- Resource utilization
- Response time

### 5. Model Affinity Tracking
**Location**: Should be in database and job assignment
**Status**: Not implemented
**Needed**: Track which models are loaded on which containers

---

## Critical Modification Points

### Priority 1 (Essential for Load Balancing)
1. `/home/user/comfyuiapi/backend/src/services/jobProcessor.js` - Line 263-282
   - Replace `selectContainer()` with load-aware version

2. `/home/user/comfyuiapi/backend/src/database.js` - Line 64-76
   - Add capacity fields to containers table

3. `/home/user/comfyuiapi/backend/src/migrations/comprehensive-features.sql`
   - Add container capacity tracking columns

### Priority 2 (Important for Visibility)
1. `/home/user/comfyuiapi/backend/src/services/containerMonitor.js` - Add job counting
2. `/home/user/comfyuiapi/backend/src/routes/containers.js` - Expose container load
3. `/home/user/comfyuiapi/backend/src/middleware/metrics.js` - Add per-container metrics

### Priority 3 (Nice to Have)
1. `/home/user/comfyuiapi/backend/src/services/autoScaler.js` - Use per-container load
2. `/home/user/comfyuiapi/backend/src/services/jobService.js` - Consider container health

---

## Testing Points

### Unit Tests
- `backend/src/__tests__/services/jobService.test.js` - Job creation
- `backend/src/__tests__/services/containerMonitor.test.js` - Container monitoring
- `backend/src/__tests__/routes/containers.test.js` - Container routes

### Integration Tests
- `backend/src/__tests__/routes/jobs.test.js` - Job creation and assignment

**Note**: Current tests don't validate load balancing logic

---

## Current Implementation Timeline

From git log, the project has:
- Basic job queuing (priority-based)
- Container status monitoring
- Auto-scaling pools (by queue depth)
- Resource usage monitoring

But **NO**:
- Per-container load tracking
- Intelligent job distribution
- Capacity-aware assignment
- Health-based selection

