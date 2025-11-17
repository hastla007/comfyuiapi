# Container Load & Availability Investigation - Documentation Index

## Overview
This investigation analyzes how the ComfyUI API system tracks container load and availability, and what would be needed to implement intelligent load balancing between containers supporting the same model.

---

## Investigation Questions & Answers

### Quick Summary
| Question | Answer | Status |
|----------|--------|--------|
| Does the system track which containers are busy vs free? | NO | Missing |
| Is there a "max concurrent jobs" limit per container? | Global only (10) | Partial |
| Is there any logic to check active jobs per container? | NO | Missing |
| When selecting a container, does it check load/capacity? | NO | Missing |
| Are there any database fields tracking capacity/load? | NO | Missing |
| What's needed for intelligent load balancing? | Complete redesign | See docs |

---

## Documentation Files

### 1. **LOAD_BALANCING_SUMMARY.md** (11 KB) - START HERE
**Best for:** Executive overview, decision makers, quick understanding

Contains:
- Executive summary of findings
- 6 key questions answered
- Current vs missing features
- The problem in action (real scenario)
- Impact assessment (HIGH RISK)
- Implementation effort estimation
- 3 implementation options
- Risk mitigation strategies
- Success criteria

**Read this if you:** Need to understand the scope quickly, want executive-level details, need to make decisions

---

### 2. **LOAD_TRACKING_ANALYSIS.md** (14 KB) - COMPREHENSIVE
**Best for:** Deep technical understanding, developers, architects

Contains:
- Detailed current implementation analysis
- Evidence from actual code
- Database schema analysis
- Gap analysis (comprehensive)
- What's tracked vs not tracked
- Implementation roadmap
- Load balancing algorithm examples
- Risk assessment
- Summary table

**Read this if you:** Need comprehensive technical details, want examples, doing code review

---

### 3. **CODE_LOCATIONS_REFERENCE.md** (8.6 KB) - DEVELOPER GUIDE
**Best for:** Developers implementing changes, code navigation

Contains:
- All relevant file locations with line numbers
- Current code snippets showing problems
- Database queries (current vs needed)
- Missing code/features checklist
- Critical modification points
- Testing locations
- Implementation timeline

**Read this if you:** Implementing the changes, need specific file/line numbers, doing code modifications

---

### 4. **IMPLEMENTATION_EXAMPLES.md** (17 KB) - IMPLEMENTATION GUIDE
**Best for:** Developers doing the actual implementation

Contains:
- Complete migration SQL code (ready to use)
- Before/after code comparisons
- Complete method implementations
- API endpoint code (copy-paste ready)
- Testing code examples
- Implementation checklist
- Quick start guide

**Read this if you:** Doing the actual implementation, need code examples, want templates to copy

---

## Reading Guide by Role

### For Project Manager
1. Read: LOAD_BALANCING_SUMMARY.md (sections: Overview, Problem, Impact, Effort)
2. Decision: Choose Option 1/2/3 for implementation
3. Reference: Implementation Effort section for timeline

### For Architect
1. Read: LOAD_BALANCING_SUMMARY.md (complete)
2. Read: LOAD_TRACKING_ANALYSIS.md (especially sections 5 & 6)
3. Decide: Implementation approach and phasing
4. Plan: Integration with existing systems

### For Senior Developer
1. Read: CODE_LOCATIONS_REFERENCE.md (understand current code)
2. Read: LOAD_TRACKING_ANALYSIS.md (understand requirements)
3. Review: IMPLEMENTATION_EXAMPLES.md (code templates)
4. Plan: Refactoring and testing strategy

### For Junior Developer
1. Read: LOAD_BALANCING_SUMMARY.md (learn the context)
2. Read: CODE_LOCATIONS_REFERENCE.md (find relevant files)
3. Follow: IMPLEMENTATION_EXAMPLES.md (step by step)
4. Reference: Code snippets for implementation

### For DevOps/SRE
1. Read: LOAD_BALANCING_SUMMARY.md (sections: Impact, Monitoring)
2. Read: LOAD_TRACKING_ANALYSIS.md (sections: What's tracked)
3. Plan: Monitoring, alerting, metrics
4. Design: Dashboard visualization

---

## Key Findings Summary

### The Problem
- All jobs go to Container 1 (first by ID)
- No per-container job count tracking
- No capacity enforcement
- No intelligent distribution
- Risk: Container 1 overloaded, others idle

### The Solution
- Track active jobs per container in database
- Select least-loaded container for new jobs
- Enforce capacity limits
- Score container health
- Distribute jobs intelligently

### The Effort
- **Complexity:** Medium (3-5 days)
- **Risk:** Low (non-breaking, incremental)
- **Impact:** High (enables scalability, improves performance)

### The Files to Change
1. Database schema (1 new migration file)
2. jobProcessor.js (selectContainer method)
3. containerMonitor.js (add job counting)
4. routes/containers.js (expose load info)
5. routes/containerPools.js (distribution endpoint)

---

## Current System State

### What Works
✓ Job queuing (priority-based)
✓ Container status monitoring
✓ Resource usage tracking
✓ Auto-scaling pools
✓ Global concurrency limit

### What's Missing
✗ Per-container job counting
✗ Per-container capacity limits
✗ Load-aware job assignment
✗ Container health scoring
✗ Intelligent distribution
✗ Model affinity

---

## Implementation Roadmap

### Option 1: Minimal (2-3 days)
- Least-loaded container selection
- Basic job tracking
- Solves main problem quickly

### Option 2: Comprehensive (4-5 days) - RECOMMENDED
- Full load tracking
- Health scoring
- Model affinity
- Detailed monitoring

### Option 3: Phased (3 weeks)
- Week 1: Basic load balancing
- Week 2: Health scoring
- Week 3: Advanced features
- Lower risk, incremental delivery

---

## Success Criteria

1. **Distribution** - Jobs spread across containers, not all on one
2. **Capacity** - No container exceeds its concurrent job limit
3. **Health** - Degraded containers excluded from selection
4. **Monitoring** - Dashboard shows per-container load
5. **Performance** - Assignment time <100ms, scales to 10+ containers

---

## Database Changes Required

### Add to containers table
```sql
max_concurrent_jobs INTEGER DEFAULT 3
health_status VARCHAR(50) DEFAULT 'healthy'
cpu_limit_percent DECIMAL(5,2) DEFAULT 100
memory_limit_percent DECIMAL(5,2) DEFAULT 100
```

### New table: container_active_jobs
```sql
container_id → containers(id)
job_id → jobs(id)
status, started_at, completed_at
```

### New view: container_load_status
Shows current load, capacity, health per container

---

## Code Changes Required

### jobProcessor.js - selectContainer()
Replace: `ORDER BY id ASC LIMIT 1`
With: Least-loaded algorithm with health checks

### Add methods
- trackJobStarted()
- trackJobCompleted()
- calculateHealthStatus()

### containerMonitor.js
Add: Job counting and health scoring

### API endpoints
- GET /api/containers/:id/load-status
- GET /api/container-pools/:id/load-distribution

---

## Next Steps

1. **Read:** Start with LOAD_BALANCING_SUMMARY.md
2. **Discuss:** Team review of findings and approach
3. **Decide:** Choose implementation option (1/2/3)
4. **Plan:** Create detailed project plan
5. **Implement:** Follow IMPLEMENTATION_EXAMPLES.md
6. **Test:** Use provided test cases
7. **Deploy:** Run migration, deploy code, monitor

---

## Quick Links

- Executive Summary: `LOAD_BALANCING_SUMMARY.md`
- Technical Analysis: `LOAD_TRACKING_ANALYSIS.md`
- Code Reference: `CODE_LOCATIONS_REFERENCE.md`
- Implementation Guide: `IMPLEMENTATION_EXAMPLES.md`

---

## Investigation Details

**Investigator:** Claude Code Analysis
**Date:** November 17, 2025
**Scope:** Container load tracking and availability monitoring
**Status:** Complete - Ready for implementation

---

## FAQ

**Q: Is this urgent?**
A: Yes. Current risk is HIGH - all jobs go to one container. Can cause overload and poor scalability.

**Q: How long to implement?**
A: 3-5 days depending on option chosen (minimal/comprehensive/phased).

**Q: Can we do it incrementally?**
A: Yes, Option 3 (phased) spreads implementation over 3 weeks.

**Q: Will it break existing code?**
A: No, we add columns with defaults and new tables. Backward compatible.

**Q: What's the success rate for similar implementations?**
A: High. This is standard load balancing practice, proven patterns.

**Q: Can we roll back if needed?**
A: Yes, the changes are isolated and can be disabled with feature flags.

**Q: Should we implement before going to production?**
A: Strongly recommended. Current behavior doesn't scale beyond 1 container.

---

## Contact

For questions about this investigation:
- See the specific documentation file for detailed answers
- Code examples in IMPLEMENTATION_EXAMPLES.md are copy-paste ready
- All file locations referenced in CODE_LOCATIONS_REFERENCE.md
