# Container Load & Availability Tracking Analysis

## Current State Summary

The system has **minimal container load tracking and no intelligent load balancing**. Containers are treated as interchangeable units without per-container capacity or job count tracking.

---

## 1. Container Busy vs Free Tracking

### Current Implementation
**NO** - The system does NOT track which containers are busy vs free.

#### Evidence:
- **containerMonitor.js**: Monitors container health status (running/stopped), CPU, memory, network, but **NOT active job counts**
- **Database schema**: The `containers` table has NO field for tracking:
  - Current job count
  - Active jobs
  - Container load
  - Available capacity

#### Container Table Schema
```sql
CREATE TABLE containers (
  id SERIAL PRIMARY KEY,
  container_id VARCHAR(255),
  name VARCHAR(255),
  port INTEGER,
  status VARCHAR(50),           -- 'running', 'stopped'
  workflow_id INTEGER,
  organization_id INTEGER,
  pool_id INTEGER,
  last_activity_at TIMESTAMP,   -- Only activity time, not job count
  gpu_resource_id INTEGER,
  gpu_memory_limit_mb INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### What's Missing
- `active_job_count` field
- `max_concurrent_jobs_per_container` field
- `current_load` field
- `supported_models` field
- Container health/readiness status

---

## 2. Maximum Concurrent Jobs Per Container

### Current Implementation
**PARTIAL & FLAWED**

There IS a global system-wide limit, but:
- **Not per-container**
- **Not configurable per container**
- **Hardcoded in memory**

#### Code Evidence (jobProcessor.js):
```javascript
class JobProcessor {
  constructor() {
    this.maxConcurrentJobs = 10;  // GLOBAL limit across ALL containers
    this.processingJobs = new Map(); // Tracked in memory only
  }
  
  async processNextJob() {
    // Check if we've hit max concurrent jobs
    if (this.processingJobs.size >= this.maxConcurrentJobs) {
      return;
    }
  }
}
```

### Problems
1. **Global limit** - 10 jobs total system-wide, not per-container
2. **In-memory only** - Not persistent across restarts
3. **No database persistence** - Can't survive application crash
4. **No per-container limits** - Can't set different limits for different container types
5. **No accounting for container resources** - Doesn't consider CPU/memory availability

---

## 3. Active Job Count Per Container

### Current Implementation
**NO**

#### Evidence:
Container Monitor tracks resource stats but NOT active jobs:
```javascript
// containerMonitor.js - Only tracks these metrics:
const currentState = {
  status: inspect.State.Running ? 'running' : 'stopped',
  health: inspect.State.Health?.Status || 'unknown',
  startedAt: inspect.State.StartedAt,
  finishedAt: inspect.State.FinishedAt,
  exitCode: inspect.State.ExitCode,
  pid: inspect.State.Pid
};

// Stats include CPU, memory, network - NOT job count
const stats = {
  cpu: { percent, cores },
  memory: { usage, limit, percent, usageMB, limitMB },
  network: { rx, tx, rxMB, txMB },
  blockIO: { read, write, readMB, writeMB }
};
```

### Workaround Attempts
The `processingJobs` Map in jobProcessor stores in-memory tracking:
```javascript
this.processingJobs = new Map(); // jobId -> { client, promptId, containerId }
```

**But this:**
- Only tracks jobs in the current jobProcessor instance
- Doesn't link jobs to containers in database
- Is lost on restart
- Doesn't provide database-backed querying

### What's Needed
- Database query to count active jobs per container
- Real-time update when jobs start/complete
- Persistent tracking across restarts

---

## 4. Container Load Check During Job Assignment

### Current Implementation
**MINIMAL - NO LOAD BALANCING**

#### Container Selection Logic (jobProcessor.js):
```javascript
async selectContainer(preferredContainerId = null) {
  // If a specific container is requested, use it
  if (preferredContainerId) {
    const result = await pool.query(
      'SELECT * FROM containers WHERE id = $1 AND status = $2',
      [preferredContainerId, 'running']
    );
    return result.rows[0] || null;
  }

  // Otherwise, find ANY running container
  const result = await pool.query(
    `SELECT * FROM containers
     WHERE status = 'running'
     ORDER BY id ASC
     LIMIT 1`
  );

  return result.rows[0] || null;
}
```

### Problems
1. **Selects FIRST running container by ID** - Always picks container with lowest ID
2. **No load consideration** - Ignores how many jobs it's already running
3. **No resource checking** - Doesn't check CPU/memory usage
4. **No capacity limits** - Assigns jobs even if container is saturated
5. **First-come-first-served** - Not round-robin, not least-loaded

### Current Flow
```
Job Created → Added to Queue → Selected Container
           [queued]         
                              ↓
                         selectContainer()
                              ↓
                    "Give me ANY running container"
                              ↓
                         Returns id=1 (or first available)
                              ↓
                    Assigned to Container 1 (always!)
```

---

## 5. Load Balancing Requirements

### What Would Be Needed

#### A. Database Schema Changes
```sql
-- Track container capacity and current load
ALTER TABLE containers ADD COLUMN IF NOT EXISTS:
  - max_concurrent_jobs INTEGER DEFAULT 3
  - current_job_count INTEGER DEFAULT 0
  - supported_models TEXT[] -- or JSON
  - last_job_completed_at TIMESTAMP
  - health_status VARCHAR(50) DEFAULT 'healthy'
  - cpu_throttle_percent DECIMAL(5,2) DEFAULT 0
  - memory_throttle_percent DECIMAL(5,2) DEFAULT 0;

-- Create container_jobs junction table for tracking
CREATE TABLE container_active_jobs (
  id SERIAL PRIMARY KEY,
  container_id INTEGER REFERENCES containers(id),
  job_id INTEGER REFERENCES jobs(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50),
  UNIQUE(container_id, job_id)
);

-- Index for fast queries
CREATE INDEX idx_container_active_jobs ON container_active_jobs(container_id, status);
```

#### B. Job Assignment Logic Changes
Replace simple selection with weighted scoring:

```javascript
async selectContainer(model = null) {
  // Get containers with active job counts
  const result = await pool.query(`
    SELECT 
      c.*,
      COUNT(j.id) as active_job_count
    FROM containers c
    LEFT JOIN jobs j ON c.id = j.container_id 
      AND j.status = 'processing'
    WHERE c.status = 'running'
    GROUP BY c.id
    HAVING COUNT(j.id) < c.max_concurrent_jobs
    ORDER BY 
      active_job_count ASC,  -- Least loaded first
      c.last_activity_at DESC -- Most recently active
    LIMIT 1
  `);
  
  return result.rows[0] || null;
}
```

#### C. Model Affinity (for multi-model containers)
```sql
CREATE TABLE container_models (
  id SERIAL PRIMARY KEY,
  container_id INTEGER REFERENCES containers(id) ON DELETE CASCADE,
  model_name VARCHAR(255) NOT NULL,
  is_loaded BOOLEAN DEFAULT true,
  loaded_at TIMESTAMP,
  UNIQUE(container_id, model_name)
);
```

#### D. Container Health Check
```javascript
async selectHealthyContainers(model = null) {
  const query = `
    SELECT 
      c.*,
      COUNT(j.id) as active_jobs,
      COALESCE(AVG(cm.cpu_percent), 0) as avg_cpu_percent,
      COALESCE(AVG(cm.memory_percent), 0) as avg_memory_percent
    FROM containers c
    LEFT JOIN jobs j ON c.id = j.container_id AND j.status = 'processing'
    LEFT JOIN container_metrics cm ON c.id = cm.container_id
    WHERE c.status = 'running'
      AND c.health_status = 'healthy'
      AND COUNT(j.id) < c.max_concurrent_jobs
  `;
  
  if (model) {
    query += `
      AND EXISTS (
        SELECT 1 FROM container_models 
        WHERE container_id = c.id 
        AND model_name = $1 
        AND is_loaded = true
      )
    `;
  }
  
  return result.rows;
}
```

---

## 6. Database Capacity/Load Fields

### Current State
```sql
-- Containers table has:
✓ status (running/stopped)
✓ last_activity_at (timestamp)
✓ gpu_resource_id (foreign key)
✓ gpu_memory_limit_mb (integer)

-- MISSING:
✗ active_job_count
✗ max_concurrent_jobs
✗ current_cpu_percent
✗ current_memory_percent
✗ supported_models
✗ health_score
✗ queue_depth_preference
```

### Auto-Scaler Metrics (Not Directly Used for Job Assignment)
```javascript
// getPoolMetrics() - only for scaling decisions, not job assignment:
{
  current_containers: COUNT(*),
  idle_containers: COUNT(*) with old activity timestamp,
  queue_depth: COUNT(jobs WHERE status='queued'),
  processing_jobs: COUNT(jobs WHERE status='processing')
}
```

Note: These metrics exist for **auto-scaling decisions** but are NOT used for **individual job assignments**.

---

## Auto-Scaler Observations

### What It Does
- Monitors queue depth (global, not per-container)
- Scales containers up/down based on queue threshold
- Tracks idle containers by `last_activity_at` timestamp

### Limitations for Load Balancing
```javascript
// Scaling check (autoScaler.js, line 104):
if (queueDepth >= containerPool.scale_up_threshold) {
  // Scales based on: queue_depth / target_queue_depth
  // Does NOT consider per-container load
}

// Also tracks:
// - Queue depth (global)
// - Idle containers (by timestamp)
// - But NOT: jobs per container, or resource utilization patterns
```

---

## What's Tracked vs Not Tracked

### Currently Tracked
- Container status (running/stopped)
- Container health (Docker health check)
- Container resource usage (CPU %, memory %, network I/O)
- Pool-level queue depth (global)
- Idle containers (by last activity time)
- Global active job count (in-memory only)
- Job progress (0-100%)

### NOT Tracked
- **Jobs per container** (critical gap)
- **Container capacity limits** (per-container max concurrent)
- **Model availability per container** (which models loaded)
- **Container readiness** (truly ready to accept jobs?)
- **Job failure patterns** (per container)
- **Container performance** (job completion times)
- **Load history** (trends over time)

---

## Implementation Roadmap for Intelligent Load Balancing

### Phase 1: Database Foundation (Required)
```sql
-- 1. Add capacity tracking to containers
ALTER TABLE containers ADD COLUMN max_concurrent_jobs INTEGER DEFAULT 3;
ALTER TABLE containers ADD COLUMN health_score DECIMAL(5,2) DEFAULT 100;

-- 2. Create active job tracking table
CREATE TABLE container_active_jobs (...);

-- 3. Create model support table
CREATE TABLE container_models (...);

-- 4. Add indexes
CREATE INDEX idx_containers_available_capacity 
ON containers(status) WHERE status='running';
```

### Phase 2: Job Assignment Logic (High Priority)
- Implement load-aware container selection
- Check active job count before assignment
- Implement least-loaded container strategy
- Add capacity validation before assignment

### Phase 3: Monitoring & Metrics (Medium Priority)
- Track jobs per container in database
- Update active job count in real-time
- Create containerMetrics table for historical tracking
- Expose container load via metrics endpoint

### Phase 4: Advanced Features (Lower Priority)
- Model affinity scheduling
- Container health scoring
- Predictive load balancing
- Cost-aware scheduling
- SLA enforcement per container

---

## Example: Load Balancing Algorithm

### Simple Least-Loaded Strategy
```javascript
async selectOptimalContainer(model = null) {
  const query = `
    WITH container_loads AS (
      SELECT 
        c.id,
        c.name,
        c.port,
        c.max_concurrent_jobs,
        COUNT(CASE WHEN j.status = 'processing' THEN 1 END) as active_jobs,
        (100.0 * COUNT(CASE WHEN j.status = 'processing' THEN 1 END) / 
         NULLIF(c.max_concurrent_jobs, 0)) as load_percent,
        COALESCE(s.cpu_percent, 0) as current_cpu,
        COALESCE(s.memory_percent, 0) as current_memory
      FROM containers c
      LEFT JOIN jobs j ON c.id = j.container_id
      LEFT JOIN (
        SELECT DISTINCT ON (container_id) *
        FROM container_metrics
        ORDER BY container_id, measured_at DESC
      ) s ON c.id = s.container_id
      WHERE c.status = 'running'
      GROUP BY c.id, c.name, c.port, c.max_concurrent_jobs, s.cpu_percent, s.memory_percent
    )
    SELECT *
    FROM container_loads
    WHERE active_jobs < max_concurrent_jobs
      AND load_percent < 90
      AND current_cpu < 80
      AND current_memory < 85
    ORDER BY 
      load_percent ASC,
      current_cpu ASC,
      current_memory ASC
    LIMIT 1
  `;

  return await pool.query(query, [model]);
}
```

---

## Risk Assessment

### Current Risks
1. **No job distribution** - All jobs go to container 1
2. **No capacity limits** - Container 1 gets overloaded
3. **No failover** - If container 1 fails, system backs up
4. **Poor scalability** - Adding containers doesn't help if jobs all go to first one
5. **No SLA enforcement** - High-priority jobs stuck behind low-priority ones on same container

### With Load Balancing
1. Jobs distributed across available containers
2. Better resource utilization
3. Improved fault tolerance
4. Better performance for high-priority jobs
5. Easier to add containers (automatic load distribution)

---

## Summary

| Aspect | Current | Status |
|--------|---------|--------|
| Container busy/free tracking | Not tracked | ✗ Missing |
| Max concurrent jobs per container | Global only (hardcoded 10) | ⚠ Partial |
| Active job count per container | In-memory only | ⚠ Partial |
| Container load check at assignment | None (picks first by ID) | ✗ Missing |
| Database capacity fields | None | ✗ Missing |
| Load balancing logic | None | ✗ Missing |
| Health-based selection | None | ✗ Missing |
| Model affinity | None | ✗ Missing |

**Conclusion**: The system needs a complete load balancing implementation across all layers: database schema, job assignment logic, and monitoring.
