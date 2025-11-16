const crypto = require('crypto');
const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Cache Service
 * Handles result caching for workflow executions
 * Uses database for persistent cache with optional Redis integration
 */

// Default TTL (1 hour)
const DEFAULT_TTL = 3600;

/**
 * Generate cache key from workflow and parameters
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Workflow parameters
 * @returns {string} Cache key
 */
function generateCacheKey(workflowId, parameters) {
  const paramsHash = hashParameters(parameters);
  return `workflow_${workflowId}_${paramsHash}`;
}

/**
 * Hash parameters for cache key
 * @param {Object} parameters - Parameters object
 * @returns {string} Hash string
 */
function hashParameters(parameters) {
  // Sort keys to ensure consistent hashing
  const sortedParams = {};
  Object.keys(parameters).sort().forEach(key => {
    sortedParams[key] = parameters[key];
  });

  const paramsString = JSON.stringify(sortedParams);
  return crypto.createHash('sha256').update(paramsString).digest('hex');
}

/**
 * Get cached result
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Workflow parameters
 * @returns {Promise<Object|null>} Cached result or null if not found
 */
async function get(workflowId, parameters) {
  const client = await pool.connect();

  try {
    const cacheKey = generateCacheKey(workflowId, parameters);
    const paramsHash = hashParameters(parameters);

    const result = await client.query(`
      SELECT * FROM cache_entries
      WHERE cache_key = $1
        AND workflow_id = $2
        AND parameters_hash = $3
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [cacheKey, workflowId, paramsHash]);

    if (result.rows.length === 0) {
      logger.debug('Cache miss', { workflowId, cacheKey });
      return null;
    }

    const cacheEntry = result.rows[0];

    // Update hit count and last accessed time
    await client.query(`
      UPDATE cache_entries
      SET hit_count = hit_count + 1,
          last_accessed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [cacheEntry.id]);

    logger.info('Cache hit', {
      workflowId,
      cacheKey,
      hitCount: cacheEntry.hit_count + 1
    });

    return {
      result: cacheEntry.result,
      output_url: cacheEntry.output_url,
      cached_at: cacheEntry.created_at,
      hit_count: cacheEntry.hit_count + 1
    };
  } finally {
    client.release();
  }
}

/**
 * Set cache entry
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Workflow parameters
 * @param {Object} result - Result to cache
 * @param {string} outputUrl - Output URL (optional)
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<Object>} Cache entry
 */
async function set(workflowId, parameters, result, outputUrl = null, ttl = DEFAULT_TTL) {
  const client = await pool.connect();

  try {
    const cacheKey = generateCacheKey(workflowId, parameters);
    const paramsHash = hashParameters(parameters);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Upsert cache entry
    const dbResult = await client.query(`
      INSERT INTO cache_entries (
        cache_key, workflow_id, parameters_hash,
        result, output_url, ttl_seconds, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (cache_key)
      DO UPDATE SET
        result = $4,
        output_url = $5,
        ttl_seconds = $6,
        expires_at = $7,
        created_at = CURRENT_TIMESTAMP,
        hit_count = 0
      RETURNING *
    `, [cacheKey, workflowId, paramsHash, result, outputUrl, ttl, expiresAt]);

    logger.info('Cache entry created', {
      workflowId,
      cacheKey,
      ttl,
      expiresAt
    });

    return dbResult.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Invalidate cache for workflow
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Specific parameters (optional, invalidates all if not provided)
 * @returns {Promise<number>} Number of entries invalidated
 */
async function invalidate(workflowId, parameters = null) {
  const client = await pool.connect();

  try {
    let query;
    let params;

    if (parameters) {
      // Invalidate specific entry
      const cacheKey = generateCacheKey(workflowId, parameters);
      query = 'DELETE FROM cache_entries WHERE cache_key = $1';
      params = [cacheKey];
    } else {
      // Invalidate all entries for workflow
      query = 'DELETE FROM cache_entries WHERE workflow_id = $1';
      params = [workflowId];
    }

    const result = await client.query(query, params);

    logger.info('Cache invalidated', {
      workflowId,
      entriesDeleted: result.rowCount
    });

    return result.rowCount;
  } finally {
    client.release();
  }
}

/**
 * Clean up expired cache entries
 * @returns {Promise<number>} Number of entries cleaned up
 */
async function cleanup() {
  const result = await pool.query(`
    DELETE FROM cache_entries
    WHERE expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP
  `);

  logger.info('Cache cleanup completed', {
    entriesDeleted: result.rowCount
  });

  return result.rowCount;
}

/**
 * Get cache statistics
 * @param {number} workflowId - Workflow ID (optional)
 * @returns {Promise<Object>} Cache statistics
 */
async function getStats(workflowId = null) {
  const client = await pool.connect();

  try {
    let query = `
      SELECT
        COUNT(*) as total_entries,
        COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL THEN 1 END) as active_entries,
        COUNT(CASE WHEN expires_at < CURRENT_TIMESTAMP THEN 1 END) as expired_entries,
        SUM(hit_count) as total_hits,
        AVG(hit_count) as avg_hits_per_entry
      FROM cache_entries
    `;

    const params = [];

    if (workflowId) {
      query += ' WHERE workflow_id = $1';
      params.push(workflowId);
    }

    const result = await client.query(query, params);

    const stats = result.rows[0];

    // Get cache hit rate (requires tracking misses separately)
    return {
      total_entries: parseInt(stats.total_entries) || 0,
      active_entries: parseInt(stats.active_entries) || 0,
      expired_entries: parseInt(stats.expired_entries) || 0,
      total_hits: parseInt(stats.total_hits) || 0,
      avg_hits_per_entry: parseFloat(stats.avg_hits_per_entry) || 0
    };
  } finally {
    client.release();
  }
}

/**
 * Get top cached workflows
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Top workflows by cache hits
 */
async function getTopCachedWorkflows(limit = 10) {
  const result = await pool.query(`
    SELECT
      ce.workflow_id,
      w.name as workflow_name,
      COUNT(*) as cache_entries,
      SUM(ce.hit_count) as total_hits,
      AVG(ce.hit_count) as avg_hits
    FROM cache_entries ce
    LEFT JOIN workflows w ON ce.workflow_id = w.id
    WHERE ce.expires_at > CURRENT_TIMESTAMP OR ce.expires_at IS NULL
    GROUP BY ce.workflow_id, w.name
    ORDER BY total_hits DESC
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    workflow_id: row.workflow_id,
    workflow_name: row.workflow_name,
    cache_entries: parseInt(row.cache_entries),
    total_hits: parseInt(row.total_hits),
    avg_hits: parseFloat(row.avg_hits)
  }));
}

/**
 * Warm cache with common workflows
 * @param {Array} workflows - Array of {workflowId, parameters, result}
 * @returns {Promise<number>} Number of entries warmed
 */
async function warmCache(workflows) {
  let count = 0;

  for (const workflow of workflows) {
    try {
      await set(
        workflow.workflowId,
        workflow.parameters,
        workflow.result,
        workflow.outputUrl,
        workflow.ttl || DEFAULT_TTL
      );
      count++;
    } catch (error) {
      logger.error('Error warming cache entry:', error);
    }
  }

  logger.info('Cache warmed', { entriesCreated: count });

  return count;
}

/**
 * Get cache entries for workflow
 * @param {number} workflowId - Workflow ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Cache entries
 */
async function listEntries(workflowId, options = {}) {
  const { limit = 50, offset = 0, includeExpired = false } = options;

  let query = `
    SELECT * FROM cache_entries
    WHERE workflow_id = $1
  `;

  if (!includeExpired) {
    query += ' AND (expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL)';
  }

  query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';

  const result = await pool.query(query, [workflowId, limit, offset]);

  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM cache_entries WHERE workflow_id = $1',
    [workflowId]
  );

  return {
    entries: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Check if result is cached
 * @param {number} workflowId - Workflow ID
 * @param {Object} parameters - Workflow parameters
 * @returns {Promise<boolean>} True if cached
 */
async function isCached(workflowId, parameters) {
  const cacheKey = generateCacheKey(workflowId, parameters);

  const result = await pool.query(
    `SELECT id FROM cache_entries
     WHERE cache_key = $1
       AND (expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL)`,
    [cacheKey]
  );

  return result.rows.length > 0;
}

/**
 * Start periodic cleanup task
 */
let cleanupInterval = null;

function startCleanupTask(intervalMinutes = 60) {
  if (cleanupInterval) {
    logger.warn('Cache cleanup task already running');
    return;
  }

  cleanupInterval = setInterval(async () => {
    try {
      await cleanup();
    } catch (error) {
      logger.error('Error in cache cleanup task:', error);
    }
  }, intervalMinutes * 60 * 1000);

  logger.info('Cache cleanup task started', { intervalMinutes });
}

/**
 * Stop periodic cleanup task
 */
function stopCleanupTask() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Cache cleanup task stopped');
  }
}

module.exports = {
  get,
  set,
  invalidate,
  cleanup,
  getStats,
  getTopCachedWorkflows,
  warmCache,
  listEntries,
  isCached,
  startCleanupTask,
  stopCleanupTask,
  generateCacheKey
};
