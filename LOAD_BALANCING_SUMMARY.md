# Container Load & Availability Tracking - Executive Summary

## Investigation Results

### Questions Answered

1. **Does the system track which containers are currently busy vs free?**
   - **NO** - Containers have no per-container job count tracking
   - Only global metrics exist (queue depth, processing job count)
   - Container monitor tracks resource usage but NOT active job counts

2. **Is there a "max concurrent jobs" limit per container?**
   - **NO** - There is ONLY a global hardcoded limit of 10 jobs system-wide
   - Not configurable per container
   - Not persisted in database
   - Not part of container configuration

3. **Is there any logic to check how many active jobs a container has?**
   - **NO** - No database queries exist to count active jobs per container
   - In-memory Map tracks jobs in current jobProcessor instance
   - No persistence across restarts
   - Not used for job assignment decisions

4. **When selecting a container, does it check container load/capacity?**
   - **NO** - Container selection uses: `ORDER BY id ASC LIMIT 1`
   - Always picks first container by database ID
   - No load consideration whatsoever
   - No resource checking
   - No capacity validation

5. **What would need to be implemented for load balancing?**
   - [ ] Database schema changes (container capacity fields)
   - [ ] Active job tracking table
   - [ ] Load-aware container selection algorithm
   - [ ] Container health scoring
   - [ ] Real-time monitoring of per-container load
   - [ ] Metrics endpoints for visibility

6. **Are there any fields in the database tracking container capacity or current job count?**
   - **NO** - Containers table has NO capacity or load fields
   - Only status, activity timestamp, and resource limits exist
   - No tracking of jobs per container
   - No health status field

---

## Current System State

### What Exists
✓ Job queuing (priority-based)
✓ Container status monitoring (running/stopped)
✓ Resource usage monitoring (CPU, memory, network)
✓ Global queue depth tracking
✓ Auto-scaling by pool (scale up/down containers)
✓ Global job concurrency limit (hardcoded 10)

### What's Missing (CRITICAL GAPS)
✗ Per-container job count tracking
✗ Per-container capacity limits
✗ Load-aware job assignment
✗ Container health scoring
✗ Intelligent job distribution
✗ Capacity enforcement
✗ Model affinity scheduling

---

## The Problem in Action

### Scenario: 3 Containers, 10 Pending Jobs

**Current Behavior:**
```
Container 1: Gets ALL 10 jobs (assuming it's first in DB)
Container 2: Gets 0 jobs
Container 3: Gets 0 jobs

Result: Container 1 OVERLOADED, others IDLE
```

**After Load Balancing:**
```
Container 1: ~3-4 jobs (its share)
Container 2: ~3-4 jobs (its share)
Container 3: ~3-4 jobs (its share)

Result: Balanced, optimal resource utilization
```

---

## Impact Assessment

### Current Risk Level: HIGH

1. **No Job Distribution** - All jobs to first container → bottleneck
2. **No Capacity Enforcement** - Containers get overloaded → performance degrades
3. **No Failover** - If primary container fails → entire system backs up
4. **Poor Scalability** - Adding containers doesn't help → jobs still go to #1
5. **No SLA Compliance** - Can't guarantee performance levels

### With Load Balancing: MITIGATED

- Jobs automatically distributed
- Better resource utilization
- Improved fault tolerance
- Scalable architecture
- Predictable performance

---

## Implementation Effort

### Complexity: MEDIUM (3-5 days)

#### Phase 1: Database (1 day)
- Add 4-5 columns to containers table
- Create container_active_jobs table
- Create indexes and view
- One migration file

#### Phase 2: Job Assignment (1 day)
- Rewrite selectContainer() function
- Add job tracking methods
- Update job completion handlers
- ~150 lines of code

#### Phase 3: Monitoring (1 day)
- Update containerMonitor.js
- Add health scoring
- Update container stats endpoint
- Add load status endpoints

#### Phase 4: Testing & Polish (1-2 days)
- Unit tests
- Integration tests
- Performance testing
- Documentation

---

## Key Files to Modify

**Critical (Must Change)**
1. `/backend/src/services/jobProcessor.js` - selectContainer() method
2. `/backend/src/database.js` - Schema
3. `/backend/src/migrations/` - New migration

**Important (Should Change)**
4. `/backend/src/services/containerMonitor.js` - Add job counting
5. `/backend/src/routes/containers.js` - Expose load info
6. `/backend/src/routes/containerPools.js` - Add distribution endpoint

**Nice to Have**
7. `/backend/src/middleware/metrics.js` - Per-container metrics
8. `/backend/src/services/autoScaler.js` - Use per-container load

---

## Recommended Approach

### Option 1: Minimal (Quick Win)
- Implement least-loaded container selection
- Track active jobs in database
- Basic health status
- Estimated: 2-3 days

**Pros:** Quick, solves main problem
**Cons:** Limited health awareness, no SLA support

### Option 2: Comprehensive (Recommended)
- Full load tracking implementation
- Health scoring algorithm
- Model affinity support
- Detailed monitoring endpoints
- Estimated: 4-5 days

**Pros:** Complete solution, future-proof, SLA-ready
**Cons:** More initial effort

### Option 3: Phased (Best for Production)
- **Week 1:** Implement basic load balancing (Option 1)
- **Week 2:** Add health scoring and monitoring
- **Week 3:** Add model affinity and SLA features
- **Ongoing:** Monitor, tune, optimize

**Pros:** Lower risk, iterative improvements
**Cons:** Multiple deployments needed

---

## Testing Requirements

### Unit Tests
- Container selection algorithm
- Load calculation
- Health scoring
- Job tracking

### Integration Tests
- Multi-container job distribution
- Capacity enforcement
- Failover behavior
- Scaling triggers

### Load Tests
- 100+ concurrent jobs
- Multiple containers (3-5)
- Monitor distribution
- Verify no overload

### Manual Tests
- Dashboard visibility
- API endpoints
- Metrics accuracy
- Real-world scenarios

---

## Success Criteria

1. **Load Distribution**
   - Jobs distributed across available containers
   - No single container has >80% of jobs

2. **Capacity Enforcement**
   - No container exceeds max_concurrent_jobs
   - Queue managed fairly

3. **Health Awareness**
   - Degraded containers excluded from selection
   - Failures handled gracefully

4. **Monitoring**
   - Dashboard shows per-container load
   - Metrics exposed via Prometheus
   - Alerting possible

5. **Performance**
   - Job assignment time <100ms
   - No database bottlenecks
   - Scales to 10+ containers

---

## Database Schema Summary

### New Columns to Add
```sql
ALTER TABLE containers ADD COLUMN:
  - max_concurrent_jobs INTEGER DEFAULT 3
  - health_status VARCHAR(50) DEFAULT 'healthy'
  - cpu_limit_percent DECIMAL(5,2) DEFAULT 100
  - memory_limit_percent DECIMAL(5,2) DEFAULT 100
```

### New Table
```sql
CREATE TABLE container_active_jobs (
  id SERIAL PRIMARY KEY,
  container_id INTEGER REFERENCES containers(id),
  job_id INTEGER REFERENCES jobs(id),
  status VARCHAR(50),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(container_id, job_id)
);
```

### New View
```sql
CREATE VIEW container_load_status AS
SELECT 
  container_id,
  COUNT(*) as active_jobs,
  MAX(max_concurrent_jobs) as capacity,
  (100.0 * COUNT(*) / MAX(max_concurrent_jobs)) as load_percent
FROM container_active_jobs
GROUP BY container_id;
```

---

## Code Change Summary

### jobProcessor.js Changes
```javascript
// BEFORE: Always picks first container
const result = await pool.query(
  `SELECT * FROM containers
   WHERE status = 'running'
   ORDER BY id ASC LIMIT 1`
);

// AFTER: Picks least-loaded healthy container
const result = await pool.query(
  `SELECT c.*, COUNT(j.id) as active_jobs
   FROM containers c
   LEFT JOIN container_active_jobs j ON c.id = j.container_id
   WHERE c.status = 'running'
     AND c.health_status = 'healthy'
     AND COUNT(j.id) < c.max_concurrent_jobs
   ORDER BY COUNT(j.id) ASC
   LIMIT 1`
);
```

### Added Methods
```javascript
async trackJobStarted(jobId, containerId) {
  // Record job assignment to container
}

async trackJobCompleted(jobId) {
  // Mark job as completed on container
}

calculateHealthStatus(stats, activeJobs, capacity) {
  // Score container health: healthy/busy/degraded/at-capacity
}
```

---

## Risk Mitigation

### Data Consistency
- Use transactions for job tracking
- Cleanup orphaned records periodically
- Validate container state before assignment

### Performance
- Index on (container_id, status)
- Materialized view for frequently queried metrics
- Cache container load for 1-2 seconds

### Backward Compatibility
- Add fields with defaults
- Old code continues to work
- Gradual migration possible

### Monitoring
- Alert on unbalanced load
- Track assignment distribution
- Monitor tracking accuracy

---

## Next Steps

### 1. Approve Approach
- [ ] Choose implementation option (1/2/3)
- [ ] Assign implementation team
- [ ] Schedule work

### 2. Implement
- [ ] Create migration file
- [ ] Update jobProcessor.js
- [ ] Update containerMonitor.js
- [ ] Add/update endpoints

### 3. Test
- [ ] Unit tests
- [ ] Integration tests
- [ ] Load testing
- [ ] Manual QA

### 4. Deploy
- [ ] Run migration
- [ ] Deploy code
- [ ] Monitor metrics
- [ ] Validate distribution

### 5. Optimize
- [ ] Tune thresholds
- [ ] Monitor performance
- [ ] Gather metrics
- [ ] Improve over time

---

## Detailed Analysis Documents

Three comprehensive documents have been prepared:

1. **load_tracking_analysis.md** (10KB)
   - Complete current state analysis
   - Gap analysis
   - Requirements for load balancing
   - Algorithm examples
   - Risk assessment

2. **code_locations_reference.md** (8KB)
   - All relevant file locations
   - Line numbers for key functions
   - Current vs needed queries
   - Testing locations
   - Priority modification points

3. **implementation_examples.md** (12KB)
   - Actual SQL migration code
   - Before/after code examples
   - Complete method implementations
   - API endpoint code
   - Test cases
   - Implementation checklist

---

## Conclusion

The system currently lacks any intelligent load balancing between containers. All jobs go to the first container regardless of its load status. Implementing container load tracking and intelligent job distribution is essential for:

- Proper resource utilization
- System scalability
- Fault tolerance
- Performance predictability

The implementation is feasible, well-understood, and can be completed in 3-5 days using the provided specifications and code examples.

**Recommendation:** Implement Option 2 (Comprehensive) using the phased approach for production deployment.
