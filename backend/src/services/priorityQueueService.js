const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Priority Queue Service
 * Implements intelligent job queue management with priority levels,
 * SLA deadlines, and cost-based optimization
 */

/**
 * Priority levels and their weights
 */
const PRIORITY_LEVELS = {
  CRITICAL: { level: 'critical', weight: 10, max_concurrent: 10 },
  HIGH: { level: 'high', weight: 5, max_concurrent: 5 },
  NORMAL: { level: 'normal', weight: 3, max_concurrent: 3 },
  LOW: { level: 'low', weight: 1, max_concurrent: 1 }
};

/**
 * Get next job from queue using priority and SLA-aware algorithm
 * @param {Object} options - Queue options
 * @returns {Promise<Object|null>} Next job to process
 */
async function getNextJob(options = {}) {
  const client = await pool.connect();

  try {
    const { containerId = null, excludeJobIds = [] } = options;

    // Build exclusion clause
    let exclusionClause = '';
    const params = [];
    let paramIndex = 1;

    if (excludeJobIds.length > 0) {
      exclusionClause = ` AND j.id NOT IN (${excludeJobIds.map((_, i) => `$${paramIndex + i}`).join(',')})`;
      params.push(...excludeJobIds);
      paramIndex += excludeJobIds.length;
    }

    // Complex query that considers:
    // 1. Priority level and weight
    // 2. SLA deadlines
    // 3. Wait time
    // 4. Queue configuration limits
    const query = `
      WITH priority_weights AS (
        SELECT
          j.*,
          qc.weight,
          qc.max_concurrent,
          -- Calculate score based on multiple factors
          (
            CASE
              -- SLA deadline urgency (highest priority if deadline approaching)
              WHEN j.sla_deadline IS NOT NULL AND j.sla_deadline < NOW() + INTERVAL '1 hour'
                THEN 1000000
              WHEN j.sla_deadline IS NOT NULL AND j.sla_deadline < NOW() + INTERVAL '4 hours'
                THEN 100000
              ELSE 0
            END
            +
            -- Base priority weight
            COALESCE(qc.weight, 1) * 1000
            +
            -- Wait time bonus (older jobs get higher priority)
            EXTRACT(EPOCH FROM (NOW() - j.created_at)) / 60
          ) as priority_score,
          -- Count currently processing jobs at this priority level
          (
            SELECT COUNT(*)
            FROM jobs j2
            WHERE j2.status = 'processing'
              AND j2.priority_level = j.priority_level
          ) as current_processing
        FROM jobs j
        LEFT JOIN queue_configs qc ON j.priority_level = qc.priority_level
        WHERE j.status = 'queued'
          ${exclusionClause}
          ${containerId ? `AND (j.container_id IS NULL OR j.container_id = $${paramIndex})` : ''}
      )
      SELECT *
      FROM priority_weights
      WHERE current_processing < max_concurrent
      ORDER BY priority_score DESC
      LIMIT 1
    `;

    if (containerId) {
      params.push(containerId);
    }

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    const job = result.rows[0];

    logger.debug('Next job selected', {
      jobId: job.id,
      priorityLevel: job.priority_level,
      priorityScore: job.priority_score,
      slaDeadline: job.sla_deadline
    });

    return job;
  } finally {
    client.release();
  }
}

/**
 * Set job priority level
 * @param {number} jobId - Job ID
 * @param {string} priorityLevel - Priority level
 * @param {Date} slaDeadline - SLA deadline (optional)
 */
async function setJobPriority(jobId, priorityLevel, slaDeadline = null) {
  if (!Object.keys(PRIORITY_LEVELS).map(k => PRIORITY_LEVELS[k].level).includes(priorityLevel)) {
    throw new Error(`Invalid priority level: ${priorityLevel}`);
  }

  await pool.query(`
    UPDATE jobs
    SET priority_level = $1,
        sla_deadline = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [priorityLevel, slaDeadline, jobId]);

  logger.info('Job priority updated', { jobId, priorityLevel, slaDeadline });
}

/**
 * Get queue statistics by priority level
 * @returns {Promise<Object>} Queue statistics
 */
async function getQueueStats() {
  const client = await pool.connect();

  try {
    // Get counts by priority level and status
    const result = await client.query(`
      SELECT
        j.priority_level,
        j.status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (NOW() - j.created_at))) as avg_wait_seconds
      FROM jobs j
      WHERE j.status IN ('queued', 'processing')
      GROUP BY j.priority_level, j.status
      ORDER BY j.priority_level, j.status
    `);

    // Get SLA violations (jobs past deadline)
    const slaResult = await client.query(`
      SELECT COUNT(*) as violations
      FROM jobs
      WHERE status IN ('queued', 'processing')
        AND sla_deadline IS NOT NULL
        AND sla_deadline < NOW()
    `);

    // Get queue configs
    const configResult = await client.query(
      'SELECT * FROM queue_configs ORDER BY weight DESC'
    );

    // Format statistics
    const stats = {
      by_priority: {},
      sla_violations: parseInt(slaResult.rows[0].violations),
      queue_configs: configResult.rows
    };

    result.rows.forEach(row => {
      if (!stats.by_priority[row.priority_level]) {
        stats.by_priority[row.priority_level] = {
          queued: 0,
          processing: 0,
          avg_wait_seconds: 0
        };
      }

      stats.by_priority[row.priority_level][row.status] = parseInt(row.count);
      stats.by_priority[row.priority_level].avg_wait_seconds = parseFloat(row.avg_wait_seconds) || 0;
    });

    return stats;
  } finally {
    client.release();
  }
}

/**
 * Rebalance queue priorities
 * Adjusts priorities based on wait time and SLA deadlines
 * @returns {Promise<number>} Number of jobs rebalanced
 */
async function rebalanceQueue() {
  const client = await pool.connect();

  try {
    let rebalancedCount = 0;

    // Escalate normal priority jobs that have been waiting too long (>1 hour)
    const escalateNormal = await client.query(`
      UPDATE jobs
      SET priority_level = 'high',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'queued'
        AND priority_level = 'normal'
        AND created_at < NOW() - INTERVAL '1 hour'
        AND sla_deadline IS NULL
    `);

    rebalancedCount += escalateNormal.rowCount;

    // Escalate to critical if SLA deadline is within 30 minutes
    const escalateSLA = await client.query(`
      UPDATE jobs
      SET priority_level = 'critical',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'queued'
        AND priority_level != 'critical'
        AND sla_deadline IS NOT NULL
        AND sla_deadline < NOW() + INTERVAL '30 minutes'
    `);

    rebalancedCount += escalateSLA.rowCount;

    // Downgrade low priority jobs that are blocking the queue
    const downgradeLow = await client.query(`
      UPDATE jobs
      SET priority_level = 'low',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'queued'
        AND priority_level = 'normal'
        AND created_at > NOW() - INTERVAL '10 minutes'
        AND sla_deadline IS NULL
        AND estimated_cost_credits < 1
    `);

    rebalancedCount += downgradeLow.rowCount;

    logger.info('Queue rebalanced', { rebalancedCount });

    return rebalancedCount;
  } finally {
    client.release();
  }
}

/**
 * Estimate job cost in credits
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Job parameters
 * @returns {Promise<number>} Estimated cost in credits
 */
async function estimateJobCost(workflowId, parameters) {
  // Simple cost estimation based on workflow complexity
  // In production, this would consider:
  // - Workflow node count
  // - Expected execution time
  // - Resource requirements (GPU, memory)
  // - Historical data

  const client = await pool.connect();

  try {
    // Get average cost from historical jobs
    const result = await client.query(`
      SELECT AVG(actual_cost_credits) as avg_cost
      FROM jobs
      WHERE workflow_id = $1
        AND status = 'completed'
        AND actual_cost_credits IS NOT NULL
      LIMIT 100
    `, [workflowId]);

    if (result.rows[0].avg_cost) {
      return parseFloat(result.rows[0].avg_cost);
    }

    // Default cost estimation
    return 1.0;
  } finally {
    client.release();
  }
}

/**
 * Update job actual cost after completion
 * @param {number} jobId - Job ID
 * @param {number} actualCost - Actual cost in credits
 */
async function updateJobCost(jobId, actualCost) {
  await pool.query(`
    UPDATE jobs
    SET actual_cost_credits = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [actualCost, jobId]);

  logger.debug('Job cost updated', { jobId, actualCost });
}

/**
 * Get jobs approaching SLA deadline
 * @param {number} hoursAhead - Hours to look ahead
 * @returns {Promise<Array>} Jobs approaching deadline
 */
async function getJobsApproachingSLA(hoursAhead = 1) {
  const result = await pool.query(`
    SELECT j.*, w.name as workflow_name
    FROM jobs j
    LEFT JOIN workflows w ON j.workflow_id = w.id
    WHERE j.status IN ('queued', 'processing')
      AND j.sla_deadline IS NOT NULL
      AND j.sla_deadline < NOW() + INTERVAL '1 hour' * $1
    ORDER BY j.sla_deadline ASC
  `, [hoursAhead]);

  return result.rows;
}

/**
 * Get queue depth by priority level
 * @returns {Promise<Object>} Queue depth statistics
 */
async function getQueueDepth() {
  const result = await pool.query(`
    SELECT
      priority_level,
      COUNT(*) as depth,
      MIN(created_at) as oldest_job,
      MAX(created_at) as newest_job
    FROM jobs
    WHERE status = 'queued'
    GROUP BY priority_level
    ORDER BY
      CASE priority_level
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END
  `);

  const depth = {};
  result.rows.forEach(row => {
    depth[row.priority_level] = {
      depth: parseInt(row.depth),
      oldest_job: row.oldest_job,
      newest_job: row.newest_job,
      wait_time_seconds: Math.floor((new Date() - new Date(row.oldest_job)) / 1000)
    };
  });

  return depth;
}

/**
 * Update queue configuration
 * @param {string} priorityLevel - Priority level
 * @param {Object} config - Configuration updates
 */
async function updateQueueConfig(priorityLevel, config) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (config.weight !== undefined) {
    updates.push(`weight = $${paramIndex}`);
    values.push(config.weight);
    paramIndex++;
  }

  if (config.max_concurrent !== undefined) {
    updates.push(`max_concurrent = $${paramIndex}`);
    values.push(config.max_concurrent);
    paramIndex++;
  }

  if (updates.length === 0) {
    return;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(priorityLevel);

  const query = `
    UPDATE queue_configs
    SET ${updates.join(', ')}
    WHERE priority_level = $${paramIndex}
  `;

  await pool.query(query, values);

  logger.info('Queue config updated', { priorityLevel, config });
}

/**
 * Calculate optimal job distribution
 * @returns {Promise<Object>} Recommended job distribution
 */
async function getOptimalDistribution() {
  const client = await pool.connect();

  try {
    // Get current distribution
    const current = await client.query(`
      SELECT
        priority_level,
        COUNT(*) as count
      FROM jobs
      WHERE status = 'queued'
      GROUP BY priority_level
    `);

    // Get available resources
    const resources = await client.query(`
      SELECT COUNT(*) as available_containers
      FROM containers
      WHERE status = 'running'
    `);

    const availableContainers = parseInt(resources.rows[0].available_containers) || 1;

    // Calculate optimal distribution based on weights
    const totalWeight = Object.values(PRIORITY_LEVELS).reduce((sum, p) => sum + p.weight, 0);

    const optimal = {};
    Object.entries(PRIORITY_LEVELS).forEach(([key, priority]) => {
      const proportion = priority.weight / totalWeight;
      optimal[priority.level] = {
        recommended_concurrent: Math.max(1, Math.floor(availableContainers * proportion)),
        max_concurrent: priority.max_concurrent
      };
    });

    return {
      current_distribution: current.rows,
      optimal_distribution: optimal,
      available_containers: availableContainers
    };
  } finally {
    client.release();
  }
}

// Start periodic queue rebalancing
let rebalanceInterval = null;

function startRebalancing(intervalMinutes = 5) {
  if (rebalanceInterval) {
    logger.warn('Queue rebalancing already running');
    return;
  }

  rebalanceInterval = setInterval(async () => {
    try {
      await rebalanceQueue();
    } catch (error) {
      logger.error('Error in queue rebalancing:', error);
    }
  }, intervalMinutes * 60 * 1000);

  logger.info('Queue rebalancing started', { intervalMinutes });
}

function stopRebalancing() {
  if (rebalanceInterval) {
    clearInterval(rebalanceInterval);
    rebalanceInterval = null;
    logger.info('Queue rebalancing stopped');
  }
}

module.exports = {
  PRIORITY_LEVELS,
  getNextJob,
  setJobPriority,
  getQueueStats,
  rebalanceQueue,
  estimateJobCost,
  updateJobCost,
  getJobsApproachingSLA,
  getQueueDepth,
  updateQueueConfig,
  getOptimalDistribution,
  startRebalancing,
  stopRebalancing
};
