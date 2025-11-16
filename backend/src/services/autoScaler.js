const { pool } = require('../database');
const docker = require('../docker');
const logger = require('../utils/logger');

/**
 * Auto-Scaler Service
 * Automatically scales container pools based on job queue depth and metrics
 */

// Scaling check interval (30 seconds)
const SCALING_CHECK_INTERVAL = 30000;
let scalingInterval = null;

/**
 * Start the auto-scaler
 */
function start() {
  if (scalingInterval) {
    logger.warn('Auto-scaler already running');
    return;
  }

  scalingInterval = setInterval(async () => {
    try {
      await checkAndScale();
    } catch (error) {
      logger.error('Error in auto-scaler:', error);
    }
  }, SCALING_CHECK_INTERVAL);

  logger.info('Auto-scaler started');
}

/**
 * Stop the auto-scaler
 */
function stop() {
  if (scalingInterval) {
    clearInterval(scalingInterval);
    scalingInterval = null;
    logger.info('Auto-scaler stopped');
  }
}

/**
 * Check all pools and scale as needed
 */
async function checkAndScale() {
  const client = await pool.connect();

  try {
    // Get all active container pools
    const poolsResult = await client.query(
      'SELECT * FROM container_pools ORDER BY id'
    );

    for (const containerPool of poolsResult.rows) {
      await evaluatePoolScaling(containerPool, client);
    }
  } finally {
    client.release();
  }
}

/**
 * Evaluate and perform scaling for a specific pool
 * @param {Object} containerPool - Container pool configuration
 * @param {Object} client - Database client
 */
async function evaluatePoolScaling(containerPool, client) {
  try {
    // Get current container count in pool
    const containerCountResult = await client.query(
      `SELECT COUNT(*) as count FROM containers
       WHERE pool_id = $1 AND status = 'running'`,
      [containerPool.id]
    );

    const currentCount = parseInt(containerCountResult.rows[0].count);

    // Get pending job count (queue depth)
    const queueDepthResult = await client.query(
      `SELECT COUNT(*) as count FROM jobs
       WHERE status = 'queued'`
    );

    const queueDepth = parseInt(queueDepthResult.rows[0].count);

    // Check for idle containers
    const idleContainersResult = await client.query(
      `SELECT COUNT(*) as count FROM containers
       WHERE pool_id = $1
         AND status = 'running'
         AND last_activity_at < NOW() - INTERVAL '1 minute' * $2`,
      [containerPool.id, containerPool.idle_timeout_minutes]
    );

    const idleContainers = parseInt(idleContainersResult.rows[0].count);

    // Scaling decision logic
    let targetCount = currentCount;

    // Scale up if queue depth exceeds threshold
    if (queueDepth >= containerPool.scale_up_threshold) {
      const desiredScale = Math.ceil(queueDepth / containerPool.target_queue_depth);
      targetCount = Math.min(desiredScale, containerPool.max_containers);
    }
    // Scale down if there are idle containers and queue is small
    else if (idleContainers > 0 && queueDepth <= containerPool.scale_down_threshold) {
      targetCount = Math.max(
        currentCount - idleContainers,
        containerPool.min_containers
      );
    }

    // Enforce min/max constraints
    targetCount = Math.max(containerPool.min_containers, targetCount);
    targetCount = Math.min(containerPool.max_containers, targetCount);

    // Perform scaling if needed
    if (targetCount > currentCount) {
      await scaleUp(containerPool, targetCount - currentCount, client);
    } else if (targetCount < currentCount) {
      await scaleDown(containerPool, currentCount - targetCount, client);
    }
  } catch (error) {
    logger.error(`Error evaluating pool ${containerPool.id}:`, error);
  }
}

/**
 * Scale up a container pool
 * @param {Object} containerPool - Container pool
 * @param {number} count - Number of containers to add
 * @param {Object} client - Database client
 */
async function scaleUp(containerPool, count, client) {
  logger.info(`Scaling up pool ${containerPool.id} by ${count} containers`);

  const beforeCount = await getPoolContainerCount(containerPool.id, client);

  for (let i = 0; i < count; i++) {
    try {
      // Create new container
      const containerName = `pool-${containerPool.id}-${Date.now()}-${i}`;
      const port = await findAvailablePort(client);

      // This would interact with Docker to create actual containers
      // For now, just create database record
      await client.query(`
        INSERT INTO containers (name, port, status, pool_id, last_activity_at)
        VALUES ($1, $2, 'running', $3, CURRENT_TIMESTAMP)
      `, [containerName, port, containerPool.id]);

      logger.info(`Container ${containerName} created for pool ${containerPool.id}`);
    } catch (error) {
      logger.error(`Error creating container for pool ${containerPool.id}:`, error);
    }
  }

  const afterCount = await getPoolContainerCount(containerPool.id, client);

  // Log scaling event
  await client.query(`
    INSERT INTO scaling_events (
      pool_id, event_type, container_count_before,
      container_count_after, reason
    )
    VALUES ($1, 'scale_up', $2, $3, $4)
  `, [
    containerPool.id,
    beforeCount,
    afterCount,
    `Queue depth triggered scale up by ${count} containers`
  ]);
}

/**
 * Scale down a container pool
 * @param {Object} containerPool - Container pool
 * @param {number} count - Number of containers to remove
 * @param {Object} client - Database client
 */
async function scaleDown(containerPool, count, client) {
  logger.info(`Scaling down pool ${containerPool.id} by ${count} containers`);

  const beforeCount = await getPoolContainerCount(containerPool.id, client);

  // Get idle containers to remove
  const idleContainersResult = await client.query(
    `SELECT * FROM containers
     WHERE pool_id = $1
       AND status = 'running'
       AND last_activity_at < NOW() - INTERVAL '1 minute' * $2
     ORDER BY last_activity_at ASC
     LIMIT $3`,
    [containerPool.id, containerPool.idle_timeout_minutes, count]
  );

  for (const container of idleContainersResult.rows) {
    try {
      // Stop and remove container (would interact with Docker)
      await client.query(
        `UPDATE containers SET status = 'stopped' WHERE id = $1`,
        [container.id]
      );

      logger.info(`Container ${container.name} stopped in pool ${containerPool.id}`);

      // Optionally delete the container record
      // await client.query('DELETE FROM containers WHERE id = $1', [container.id]);
    } catch (error) {
      logger.error(`Error stopping container ${container.id}:`, error);
    }
  }

  const afterCount = await getPoolContainerCount(containerPool.id, client);

  // Log scaling event
  await client.query(`
    INSERT INTO scaling_events (
      pool_id, event_type, container_count_before,
      container_count_after, reason
    )
    VALUES ($1, 'scale_down', $2, $3, $4)
  `, [
    containerPool.id,
    beforeCount,
    afterCount,
    `Idle timeout triggered scale down by ${count} containers`
  ]);
}

/**
 * Get current container count for a pool
 * @param {number} poolId - Pool ID
 * @param {Object} client - Database client
 * @returns {Promise<number>} Container count
 */
async function getPoolContainerCount(poolId, client) {
  const result = await client.query(
    `SELECT COUNT(*) as count FROM containers
     WHERE pool_id = $1 AND status = 'running'`,
    [poolId]
  );
  return parseInt(result.rows[0].count);
}

/**
 * Find an available port for new container
 * @param {Object} client - Database client
 * @returns {Promise<number>} Available port
 */
async function findAvailablePort(client) {
  const MIN_PORT = 8000;
  const MAX_PORT = 9000;

  // Get all used ports
  const usedPortsResult = await client.query(
    'SELECT port FROM containers WHERE status = \'running\''
  );

  const usedPorts = new Set(usedPortsResult.rows.map(row => row.port));

  // Find first available port
  for (let port = MIN_PORT; port <= MAX_PORT; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error('No available ports');
}

/**
 * Update container activity timestamp
 * @param {number} containerId - Container ID
 */
async function updateContainerActivity(containerId) {
  await pool.query(
    'UPDATE containers SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
    [containerId]
  );
}

/**
 * Get scaling metrics for a pool
 * @param {number} poolId - Pool ID
 * @returns {Promise<Object>} Scaling metrics
 */
async function getPoolMetrics(poolId) {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        cp.*,
        (SELECT COUNT(*) FROM containers WHERE pool_id = cp.id AND status = 'running') as current_containers,
        (SELECT COUNT(*) FROM containers WHERE pool_id = cp.id AND status = 'running'
         AND last_activity_at < NOW() - INTERVAL '1 minute' * cp.idle_timeout_minutes) as idle_containers,
        (SELECT COUNT(*) FROM jobs WHERE status = 'queued') as queue_depth,
        (SELECT COUNT(*) FROM jobs WHERE status = 'processing') as processing_jobs
      FROM container_pools cp
      WHERE cp.id = $1
    `, [poolId]);

    if (result.rows.length === 0) {
      return null;
    }

    const metrics = result.rows[0];

    // Get recent scaling events
    const eventsResult = await client.query(`
      SELECT * FROM scaling_events
      WHERE pool_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [poolId]);

    metrics.recent_events = eventsResult.rows;

    return metrics;
  } finally {
    client.release();
  }
}

/**
 * Manually trigger scaling for a pool
 * @param {number} poolId - Pool ID
 * @param {number} targetCount - Target container count
 */
async function manualScale(poolId, targetCount) {
  const client = await pool.connect();

  try {
    const poolResult = await client.query(
      'SELECT * FROM container_pools WHERE id = $1',
      [poolId]
    );

    if (poolResult.rows.length === 0) {
      throw new Error('Pool not found');
    }

    const containerPool = poolResult.rows[0];

    // Enforce constraints
    targetCount = Math.max(containerPool.min_containers, targetCount);
    targetCount = Math.min(containerPool.max_containers, targetCount);

    const currentCount = await getPoolContainerCount(poolId, client);
    const diff = targetCount - currentCount;

    if (diff > 0) {
      await scaleUp(containerPool, diff, client);
    } else if (diff < 0) {
      await scaleDown(containerPool, Math.abs(diff), client);
    }

    logger.info(`Manual scaling triggered for pool ${poolId}`, {
      from: currentCount,
      to: targetCount
    });
  } finally {
    client.release();
  }
}

module.exports = {
  start,
  stop,
  checkAndScale,
  updateContainerActivity,
  getPoolMetrics,
  manualScale
};
