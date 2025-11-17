# Implementation Examples & Code Changes Needed

## Quick Summary for Load Balancing Implementation

### The Problem
Currently, when multiple containers support the same model, ALL jobs go to Container 1 (lowest ID). No load distribution occurs.

### The Solution Required
Replace simple container selection with intelligent, load-aware selection that distributes jobs across containers based on current load.

---

## 1. Database Schema Changes

### Migration File to Add
**File**: `/home/user/comfyuiapi/backend/src/migrations/add-container-load-tracking.sql`

```sql
-- Add container capacity fields
ALTER TABLE containers 
ADD COLUMN IF NOT EXISTS max_concurrent_jobs INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS health_status VARCHAR(50) DEFAULT 'healthy',
ADD COLUMN IF NOT EXISTS cpu_limit_percent DECIMAL(5,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS memory_limit_percent DECIMAL(5,2) DEFAULT 100;

-- Create table to track active jobs per container
CREATE TABLE IF NOT EXISTS container_active_jobs (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'processing',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(container_id, job_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_container_active_jobs_container 
  ON container_active_jobs(container_id, status);
CREATE INDEX IF NOT EXISTS idx_container_active_jobs_job 
  ON container_active_jobs(job_id);

-- Create view for container load information
CREATE OR REPLACE VIEW container_load_status AS
SELECT 
  c.id,
  c.name,
  c.port,
  c.status,
  c.max_concurrent_jobs,
  c.health_status,
  COUNT(CASE WHEN caj.status = 'processing' THEN 1 END) as active_job_count,
  COUNT(CASE WHEN caj.status = 'processing' THEN 1 END)::float / 
    NULLIF(c.max_concurrent_jobs, 0) * 100 as load_percent
FROM containers c
LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
GROUP BY c.id, c.name, c.port, c.status, c.max_concurrent_jobs, c.health_status;
```

---

## 2. Updated Container Selection Logic

### Current Code (BAD)
**File**: `/home/user/comfyuiapi/backend/src/services/jobProcessor.js` - Lines 263-282

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

  // Otherwise, find ANY running container ← PROBLEM: Always first by ID!
  const result = await pool.query(
    `SELECT * FROM containers
     WHERE status = 'running'
     ORDER BY id ASC
     LIMIT 1`
  );

  return result.rows[0] || null;
}
```

### New Code (IMPROVED)
```javascript
async selectContainer(preferredContainerId = null, model = null) {
  // If a specific container is requested, use it
  if (preferredContainerId) {
    const result = await pool.query(
      'SELECT * FROM containers WHERE id = $1 AND status = $2',
      [preferredContainerId, 'running']
    );
    return result.rows[0] || null;
  }

  // Use load-aware selection: pick least-loaded healthy container
  const query = `
    WITH container_loads AS (
      SELECT 
        c.id,
        c.name,
        c.port,
        c.status,
        c.max_concurrent_jobs,
        c.health_status,
        COUNT(CASE WHEN caj.status = 'processing' THEN 1 END) as active_jobs
      FROM containers c
      LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
      WHERE c.status = 'running'
      GROUP BY c.id, c.name, c.port, c.status, c.max_concurrent_jobs, c.health_status
    )
    SELECT *
    FROM container_loads
    WHERE health_status = 'healthy'
      AND active_jobs < max_concurrent_jobs
    ORDER BY 
      active_jobs ASC,           -- Least loaded first
      last_activity_at DESC      -- Break ties with most recent activity
    LIMIT 1
  `;

  const result = await pool.query(query);
  
  if (result.rows.length === 0) {
    logger.warn('No healthy containers available with capacity');
    // Fallback: return any running container if desperate
    const fallback = await pool.query(
      `SELECT * FROM containers 
       WHERE status = 'running' 
       ORDER BY id ASC LIMIT 1`
    );
    return fallback.rows[0] || null;
  }

  return result.rows[0];
}
```

---

## 3. Track Active Jobs in Database

### Update executeJob() Method
**File**: `/home/user/comfyuiapi/backend/src/services/jobProcessor.js`

#### Before (Lines 113-189)
```javascript
async executeJob(job) {
  logger.info(`Executing job ${job.id} (workflow: ${job.workflow_id})`);

  try {
    const workflow = await this.getWorkflow(job.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow ${job.workflow_id} not found`);
    }

    // Select a container
    const container = await this.selectContainer(job.container_id);
    if (!container) {
      throw new Error('No available containers');
    }

    // ← MISSING: Track this job-container assignment
    
    const client = createClient(container.port);
    // ... rest of execution ...
  }
}
```

#### After (Updated)
```javascript
async executeJob(job) {
  logger.info(`Executing job ${job.id} (workflow: ${job.workflow_id})`);

  try {
    const workflow = await this.getWorkflow(job.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow ${job.workflow_id} not found`);
    }

    // Select a container
    const container = await this.selectContainer(job.container_id);
    if (!container) {
      throw new Error('No available containers');
    }

    // NEW: Track the job-container assignment
    await this.trackJobStarted(job.id, container.id);

    // Create ComfyUI client
    const client = createClient(container.port);
    
    // Store container info with processing job
    this.processingJobs.set(job.id, { 
      client, 
      promptId: null, // Will be set later
      containerId: container.id 
    });

    // ... rest of execution ...

  } catch (error) {
    logger.error(`Job ${job.id} failed:`, error);
    // Make sure to clean up tracking
    await this.trackJobCompleted(job.id);
    // ... rest of error handling ...
  }
}

// New helper methods
async trackJobStarted(jobId, containerId) {
  try {
    await pool.query(
      `INSERT INTO container_active_jobs (container_id, job_id, status)
       VALUES ($1, $2, 'processing')
       ON CONFLICT (container_id, job_id) DO UPDATE SET status = 'processing'`,
      [containerId, jobId]
    );
  } catch (error) {
    logger.error(`Failed to track job ${jobId} start:`, error);
  }
}

async trackJobCompleted(jobId) {
  try {
    await pool.query(
      `UPDATE container_active_jobs 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId]
    );
  } catch (error) {
    logger.error(`Failed to track job ${jobId} completion:`, error);
  }
}
```

---

## 4. Update completeJob() and handleJobError()

### Track Job Completion
```javascript
async completeJob(jobId, outputUrl) {
  // NEW: Mark job as completed in tracking table
  await this.trackJobCompleted(jobId);
  
  const result = await pool.query(`
    UPDATE jobs
    SET status = 'completed',
        output_image_url = $1,
        progress = 100,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, job_id, callback_url, model, result, error, completed_at
  `, [outputUrl, jobId]);

  // ... rest of method ...
}

async handleJobError(jobId, errorMessage) {
  // NEW: Mark job as completed in tracking table
  await this.trackJobCompleted(jobId);
  
  const result = await pool.query(`
    UPDATE jobs
    SET status = 'failed',
        error_message = $1,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, job_id, callback_url, model, request_payload, user_id
  `, [errorMessage, jobId]);

  // ... rest of method ...
}
```

---

## 5. Container Monitoring Updates

### Add Job Counting to Container Monitor
**File**: `/home/user/comfyuiapi/backend/src/services/containerMonitor.js`

```javascript
async checkContainer(dbContainer) {
  try {
    const dockerContainer = getContainer(dbContainer.container_id);
    const inspect = await dockerContainer.inspect();

    const currentState = {
      status: inspect.State.Running ? 'running' : 'stopped',
      health: inspect.State.Health?.Status || 'unknown',
      startedAt: inspect.State.StartedAt,
      finishedAt: inspect.State.FinishedAt,
      exitCode: inspect.State.ExitCode,
      pid: inspect.State.Pid
    };

    // Get container stats if running
    let stats = null;
    if (inspect.State.Running) {
      try {
        const statsStream = await dockerContainer.stats({ stream: false });
        stats = this.parseStats(statsStream);
      } catch (error) {
        logger.debug(`Failed to get stats for container ${dbContainer.id}:`, error.message);
      }
    }

    // NEW: Get active job count
    const jobCountResult = await pool.query(
      `SELECT COUNT(*) as active_jobs FROM container_active_jobs
       WHERE container_id = $1 AND status = 'processing'`,
      [dbContainer.id]
    );
    const activeJobs = parseInt(jobCountResult.rows[0]?.active_jobs || 0);

    // Check if state has changed
    const lastState = this.containerStates.get(dbContainer.id);
    const hasChanged = !lastState || JSON.stringify(lastState) !== JSON.stringify(currentState);

    if (hasChanged) {
      // Update database if status changed
      if (!lastState || lastState.status !== currentState.status) {
        await pool.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [currentState.status, dbContainer.id]
        );
      }

      // NEW: Update health status based on stats
      const healthStatus = this.calculateHealthStatus(stats, activeJobs, dbContainer.max_concurrent_jobs);
      if (dbContainer.health_status !== healthStatus) {
        await pool.query(
          'UPDATE containers SET health_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [healthStatus, dbContainer.id]
        );
      }

      // Broadcast update
      websocketService.broadcastContainerStatus(dbContainer.id, {
        status: currentState.status,
        name: dbContainer.name,
        state: currentState,
        stats: stats,
        port: dbContainer.port,
        activeJobs: activeJobs,  // NEW
        healthStatus: healthStatus  // NEW
      });

      this.containerStates.set(dbContainer.id, currentState);
      logger.debug(`Container ${dbContainer.name} status: ${currentState.status}, active jobs: ${activeJobs}`);
    }
  } catch (error) {
    // ... existing error handling ...
  }
}

// NEW: Calculate container health status
calculateHealthStatus(stats, activeJobs, maxConcurrentJobs) {
  if (!stats) return 'unknown';

  // Check if container is at capacity
  if (activeJobs >= maxConcurrentJobs) {
    return 'at-capacity';
  }

  // Check resource utilization
  if (stats.cpu.percent > 90 || stats.memory.percent > 90) {
    return 'degraded';
  }

  if (stats.cpu.percent > 80 || stats.memory.percent > 80) {
    return 'busy';
  }

  return 'healthy';
}
```

---

## 6. API Endpoint Updates

### Update Container Stats Endpoint
**File**: `/home/user/comfyuiapi/backend/src/routes/containers.js`

```javascript
// Update existing endpoint to include load info
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await getContainerStats(id);
    
    // NEW: Get active job count and capacity
    const loadResult = await pool.query(
      `SELECT 
        c.max_concurrent_jobs,
        COUNT(caj.id) as active_jobs
       FROM containers c
       LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
         AND caj.status = 'processing'
       WHERE c.id = $1 OR c.container_id = $2
       GROUP BY c.id, c.max_concurrent_jobs`,
      [id, id]
    );

    const loadInfo = loadResult.rows[0] || {
      max_concurrent_jobs: 0,
      active_jobs: 0
    };

    res.json({
      success: true,
      stats,
      load: {
        active_jobs: parseInt(loadInfo.active_jobs),
        max_concurrent_jobs: loadInfo.max_concurrent_jobs,
        load_percent: loadInfo.max_concurrent_jobs > 0 ? 
          (parseInt(loadInfo.active_jobs) / loadInfo.max_concurrent_jobs * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve container stats' });
  }
});

// NEW: Endpoint to get container load status
router.get('/load-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM container_load_status
       WHERE id = $1 OR id = (SELECT id FROM containers WHERE container_id = $2)`,
      [id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error getting container load status:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve load status' });
  }
});
```

---

## 7. Monitoring Dashboard Endpoint

### New Route for Container Pool Status
```javascript
// In containerPools.js or new file
router.get('/:id/load-distribution', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.port,
        c.status,
        c.max_concurrent_jobs,
        c.health_status,
        COUNT(CASE WHEN caj.status = 'processing' THEN 1 END) as active_jobs,
        COUNT(CASE WHEN caj.status = 'processing' THEN 1 END)::float / 
          NULLIF(c.max_concurrent_jobs, 0) * 100 as load_percent
      FROM containers c
      LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
      WHERE c.pool_id = $1
      GROUP BY c.id, c.name, c.port, c.status, c.max_concurrent_jobs, c.health_status
      ORDER BY active_jobs DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        containers: result.rows,
        summary: {
          total_containers: result.rows.length,
          total_active_jobs: result.rows.reduce((sum, c) => sum + parseInt(c.active_jobs), 0),
          total_capacity: result.rows.reduce((sum, c) => sum + c.max_concurrent_jobs, 0),
          average_load_percent: result.rows.length > 0 ?
            (result.rows.reduce((sum, c) => sum + parseFloat(c.load_percent || 0), 0) / result.rows.length).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    logger.error('Error getting load distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve load distribution' });
  }
});
```

---

## 8. Testing the Changes

### Test Case 1: Simple Load Balancing
```javascript
// Create 3 containers
// Submit 10 jobs
// Verify distribution: not all go to container 1

it('should distribute jobs across available containers', async () => {
  // Create containers
  const containers = await createTestContainers(3);
  
  // Submit jobs
  for (let i = 0; i < 10; i++) {
    await submitJob(testWorkflow);
  }

  // Wait for processing
  await sleep(5000);

  // Check distribution
  const loads = await Promise.all(
    containers.map(c => getContainerLoad(c.id))
  );

  // Verify no container has more than max_concurrent_jobs
  loads.forEach(load => {
    expect(load.active_jobs).toBeLessThanOrEqual(load.max_concurrent_jobs);
  });

  // Verify jobs are distributed (not all on one container)
  const totalJobs = loads.reduce((sum, l) => sum + l.active_jobs, 0);
  expect(totalJobs).toBeGreaterThan(0);
  expect(Math.max(...loads.map(l => l.active_jobs))).toBeLessThan(10);
});
```

### Test Case 2: Capacity Enforcement
```javascript
it('should not assign jobs to full containers', async () => {
  const container = await createTestContainer({ max_concurrent_jobs: 1 });
  
  // Submit 3 jobs
  const jobIds = [];
  for (let i = 0; i < 3; i++) {
    const job = await submitJob(testWorkflow);
    jobIds.push(job.id);
  }

  // Only 1 should be on the container at any time
  const loads = [];
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    const load = await getContainerLoad(container.id);
    loads.push(load.active_jobs);
  }

  expect(Math.max(...loads)).toBeLessThanOrEqual(1);
});
```

---

## Quick Implementation Checklist

- [ ] Add migration SQL file with new schema
- [ ] Update `selectContainer()` in jobProcessor.js
- [ ] Add `trackJobStarted()` and `trackJobCompleted()` methods
- [ ] Update `executeJob()`, `completeJob()`, `handleJobError()`
- [ ] Update `checkContainer()` in containerMonitor.js
- [ ] Add `calculateHealthStatus()` method
- [ ] Update container stats endpoint
- [ ] Add new load-status endpoint
- [ ] Add load-distribution endpoint
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test with multiple containers
- [ ] Verify job distribution
- [ ] Verify capacity enforcement
- [ ] Monitor metrics endpoint
- [ ] Update documentation

