const { pool } = require('../database');
const logger = require('../utils/logger');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * GPU Manager Service
 * Handles GPU resource allocation, monitoring, and management
 */

// GPU monitoring interval (30 seconds)
const MONITORING_INTERVAL = 30000;
let monitoringInterval = null;

/**
 * GPU allocation policies
 */
const ALLOCATION_POLICIES = {
  EXCLUSIVE: 'exclusive',  // One container per GPU
  SHARED: 'shared',        // Multiple containers can share GPU
  ROUND_ROBIN: 'round_robin'  // Distribute across GPUs
};

/**
 * Initialize GPU resources from system
 * Detects available GPUs and creates resource records
 */
async function initializeGPUs() {
  const client = await pool.connect();

  try {
    // Get GPU information using nvidia-smi
    const gpus = await detectGPUs();

    for (const gpu of gpus) {
      // Check if GPU already exists
      const existingResult = await client.query(
        'SELECT id FROM gpu_resources WHERE gpu_uuid = $1',
        [gpu.uuid]
      );

      if (existingResult.rows.length === 0) {
        // Create new GPU resource
        await client.query(`
          INSERT INTO gpu_resources (
            gpu_index, gpu_uuid, name, total_memory_mb,
            allocation_policy, is_available
          )
          VALUES ($1, $2, $3, $4, $5, true)
        `, [
          gpu.index,
          gpu.uuid,
          gpu.name,
          gpu.memory_mb,
          ALLOCATION_POLICIES.SHARED
        ]);

        logger.info('GPU resource initialized', {
          index: gpu.index,
          name: gpu.name,
          memory: gpu.memory_mb
        });
      } else {
        // Update existing GPU info
        await client.query(`
          UPDATE gpu_resources
          SET name = $1, total_memory_mb = $2, updated_at = CURRENT_TIMESTAMP
          WHERE gpu_uuid = $3
        `, [gpu.name, gpu.memory_mb, gpu.uuid]);
      }
    }

    logger.info('GPU initialization completed', { gpuCount: gpus.length });
  } catch (error) {
    logger.error('Error initializing GPUs:', error);
  } finally {
    client.release();
  }
}

/**
 * Detect GPUs using nvidia-smi
 * @returns {Promise<Array>} Array of GPU info
 */
async function detectGPUs() {
  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=index,uuid,name,memory.total --format=csv,noheader,nounits'
    );

    const gpus = stdout.trim().split('\n').map(line => {
      const [index, uuid, name, memory] = line.split(',').map(s => s.trim());
      return {
        index: parseInt(index),
        uuid,
        name,
        memory_mb: parseInt(memory)
      };
    });

    return gpus;
  } catch (error) {
    logger.warn('nvidia-smi not available or no GPUs detected:', error.message);
    return [];
  }
}

/**
 * Allocate GPU to container
 * @param {number} containerId - Container ID
 * @param {number} memoryLimitMb - Memory limit in MB (optional)
 * @param {string} policy - Allocation policy (optional)
 * @returns {Promise<Object>} Allocated GPU resource
 */
async function allocateGPU(containerId, memoryLimitMb = null, policy = ALLOCATION_POLICIES.SHARED) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find available GPU based on policy
    let gpu;

    if (policy === ALLOCATION_POLICIES.EXCLUSIVE) {
      // Find GPU with no allocations
      const result = await client.query(`
        SELECT gr.* FROM gpu_resources gr
        LEFT JOIN containers c ON gr.id = c.gpu_resource_id AND c.status = 'running'
        WHERE gr.is_available = true
          AND c.id IS NULL
        ORDER BY gr.id
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        throw new Error('No exclusive GPU available');
      }

      gpu = result.rows[0];
    } else if (policy === ALLOCATION_POLICIES.ROUND_ROBIN) {
      // Find GPU with least allocations
      const result = await client.query(`
        SELECT gr.*, COUNT(c.id) as allocation_count
        FROM gpu_resources gr
        LEFT JOIN containers c ON gr.id = c.gpu_resource_id AND c.status = 'running'
        WHERE gr.is_available = true
        GROUP BY gr.id
        ORDER BY allocation_count ASC, gr.id
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        throw new Error('No GPU available');
      }

      gpu = result.rows[0];
    } else {
      // SHARED - find GPU with available memory
      const result = await client.query(`
        SELECT gr.*,
               gr.total_memory_mb - COALESCE(SUM(c.gpu_memory_limit_mb), 0) as available_memory_mb
        FROM gpu_resources gr
        LEFT JOIN containers c ON gr.id = c.gpu_resource_id AND c.status = 'running'
        WHERE gr.is_available = true
          AND gr.allocation_policy = 'shared'
        GROUP BY gr.id
        HAVING gr.total_memory_mb - COALESCE(SUM(c.gpu_memory_limit_mb), 0) >= $1
        ORDER BY available_memory_mb DESC
        LIMIT 1
      `, [memoryLimitMb || 0]);

      if (result.rows.length === 0) {
        throw new Error('No GPU with sufficient memory available');
      }

      gpu = result.rows[0];
    }

    // Allocate GPU to container
    await client.query(`
      UPDATE containers
      SET gpu_resource_id = $1,
          gpu_memory_limit_mb = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [gpu.id, memoryLimitMb, containerId]);

    // Update allocated memory
    await client.query(`
      UPDATE gpu_resources
      SET allocated_memory_mb = allocated_memory_mb + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [memoryLimitMb || 0, gpu.id]);

    await client.query('COMMIT');

    logger.info('GPU allocated to container', {
      containerId,
      gpuId: gpu.id,
      gpuIndex: gpu.gpu_index,
      memoryLimit: memoryLimitMb
    });

    return gpu;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Release GPU from container
 * @param {number} containerId - Container ID
 */
async function releaseGPU(containerId) {
  const client = await pool.connect();

  try {
    // Get container GPU info
    const containerResult = await client.query(
      'SELECT gpu_resource_id, gpu_memory_limit_mb FROM containers WHERE id = $1',
      [containerId]
    );

    if (containerResult.rows.length === 0 || !containerResult.rows[0].gpu_resource_id) {
      return; // No GPU allocated
    }

    const container = containerResult.rows[0];

    await client.query('BEGIN');

    // Update GPU allocated memory
    await client.query(`
      UPDATE gpu_resources
      SET allocated_memory_mb = allocated_memory_mb - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [container.gpu_memory_limit_mb || 0, container.gpu_resource_id]);

    // Remove GPU from container
    await client.query(`
      UPDATE containers
      SET gpu_resource_id = NULL,
          gpu_memory_limit_mb = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [containerId]);

    await client.query('COMMIT');

    logger.info('GPU released from container', {
      containerId,
      gpuId: container.gpu_resource_id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error releasing GPU:', error);
  } finally {
    client.release();
  }
}

/**
 * Monitor GPU utilization
 * Updates GPU usage logs with current metrics
 */
async function monitorGPUs() {
  const client = await pool.connect();

  try {
    const metrics = await getGPUMetrics();

    for (const metric of metrics) {
      // Find GPU by index
      const gpuResult = await client.query(
        'SELECT id FROM gpu_resources WHERE gpu_index = $1',
        [metric.index]
      );

      if (gpuResult.rows.length === 0) {
        continue;
      }

      const gpuId = gpuResult.rows[0].id;

      // Log GPU usage
      await client.query(`
        INSERT INTO gpu_usage_logs (
          gpu_resource_id, memory_used_mb,
          utilization_percent, temperature_celsius
        )
        VALUES ($1, $2, $3, $4)
      `, [
        gpuId,
        metric.memory_used_mb,
        metric.utilization_percent,
        metric.temperature_celsius
      ]);
    }
  } catch (error) {
    logger.error('Error monitoring GPUs:', error);
  } finally {
    client.release();
  }
}

/**
 * Get GPU metrics using nvidia-smi
 * @returns {Promise<Array>} GPU metrics
 */
async function getGPUMetrics() {
  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=index,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits'
    );

    const metrics = stdout.trim().split('\n').map(line => {
      const [index, memoryUsed, utilization, temperature] = line.split(',').map(s => s.trim());
      return {
        index: parseInt(index),
        memory_used_mb: parseInt(memoryUsed),
        utilization_percent: parseFloat(utilization),
        temperature_celsius: parseInt(temperature)
      };
    });

    return metrics;
  } catch (error) {
    logger.warn('Failed to get GPU metrics:', error.message);
    return [];
  }
}

/**
 * Get GPU resource statistics
 * @param {number} gpuId - GPU resource ID (optional)
 * @returns {Promise<Object>} GPU statistics
 */
async function getGPUStats(gpuId = null) {
  const client = await pool.connect();

  try {
    let query = `
      SELECT
        gr.*,
        (SELECT COUNT(*) FROM containers WHERE gpu_resource_id = gr.id AND status = 'running') as active_containers,
        gr.total_memory_mb - gr.allocated_memory_mb as available_memory_mb
      FROM gpu_resources gr
    `;

    const params = [];

    if (gpuId) {
      query += ' WHERE gr.id = $1';
      params.push(gpuId);
    }

    const result = await client.query(query, params);

    if (gpuId && result.rows.length === 0) {
      throw new Error('GPU resource not found');
    }

    // Get recent usage logs
    const usageQuery = gpuId
      ? 'SELECT * FROM gpu_usage_logs WHERE gpu_resource_id = $1 ORDER BY logged_at DESC LIMIT 100'
      : 'SELECT * FROM gpu_usage_logs ORDER BY logged_at DESC LIMIT 100';

    const usageParams = gpuId ? [gpuId] : [];
    const usageResult = await client.query(usageQuery, usageParams);

    return gpuId ? {
      gpu: result.rows[0],
      recent_usage: usageResult.rows
    } : {
      gpus: result.rows,
      recent_usage: usageResult.rows
    };
  } finally {
    client.release();
  }
}

/**
 * Start GPU monitoring
 */
function startMonitoring() {
  if (monitoringInterval) {
    logger.warn('GPU monitoring already running');
    return;
  }

  monitoringInterval = setInterval(async () => {
    try {
      await monitorGPUs();
    } catch (error) {
      logger.error('Error in GPU monitoring:', error);
    }
  }, MONITORING_INTERVAL);

  logger.info('GPU monitoring started');
}

/**
 * Stop GPU monitoring
 */
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('GPU monitoring stopped');
  }
}

/**
 * Update GPU allocation policy
 * @param {number} gpuId - GPU resource ID
 * @param {string} policy - New allocation policy
 */
async function updateAllocationPolicy(gpuId, policy) {
  if (!Object.values(ALLOCATION_POLICIES).includes(policy)) {
    throw new Error(`Invalid allocation policy: ${policy}`);
  }

  await pool.query(
    'UPDATE gpu_resources SET allocation_policy = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [policy, gpuId]
  );

  logger.info('GPU allocation policy updated', { gpuId, policy });
}

/**
 * Set GPU availability
 * @param {number} gpuId - GPU resource ID
 * @param {boolean} isAvailable - Availability status
 */
async function setGPUAvailability(gpuId, isAvailable) {
  await pool.query(
    'UPDATE gpu_resources SET is_available = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [isAvailable, gpuId]
  );

  logger.info('GPU availability updated', { gpuId, isAvailable });
}

/**
 * Get optimal GPU for allocation
 * @param {number} memoryRequirementMb - Required memory in MB
 * @returns {Promise<Object>} Optimal GPU resource
 */
async function getOptimalGPU(memoryRequirementMb = 0) {
  const result = await pool.query(`
    SELECT gr.*,
           gr.total_memory_mb - gr.allocated_memory_mb as available_memory_mb,
           (SELECT COUNT(*) FROM containers WHERE gpu_resource_id = gr.id AND status = 'running') as container_count,
           (SELECT AVG(utilization_percent) FROM gpu_usage_logs WHERE gpu_resource_id = gr.id AND logged_at > NOW() - INTERVAL '5 minutes') as avg_utilization
    FROM gpu_resources gr
    WHERE gr.is_available = true
      AND gr.total_memory_mb - gr.allocated_memory_mb >= $1
    ORDER BY
      COALESCE(avg_utilization, 0) ASC,
      container_count ASC,
      available_memory_mb DESC
    LIMIT 1
  `, [memoryRequirementMb]);

  if (result.rows.length === 0) {
    throw new Error('No suitable GPU available');
  }

  return result.rows[0];
}

module.exports = {
  ALLOCATION_POLICIES,
  initializeGPUs,
  allocateGPU,
  releaseGPU,
  monitorGPUs,
  getGPUStats,
  startMonitoring,
  stopMonitoring,
  updateAllocationPolicy,
  setGPUAvailability,
  getOptimalGPU
};
