const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const gpuManager = require('../services/gpuManager');
const { authenticateApiKey } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const logger = require('../utils/logger');

/**
 * List all GPU resources
 * GET /api/gpu
 */
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const stats = await gpuManager.getGPUStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error listing GPUs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list GPU resources'
      }
    });
  }
});

/**
 * Get GPU resource by ID
 * GET /api/gpu/:id
 */
router.get('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await gpuManager.getGPUStats(parseInt(id));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting GPU:', error);

    if (error.message === 'GPU resource not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'GPU resource not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get GPU resource'
      }
    });
  }
});

/**
 * Initialize/detect GPUs
 * POST /api/gpu/initialize
 */
router.post('/initialize', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    await gpuManager.initializeGPUs();

    res.json({
      success: true,
      message: 'GPU initialization completed'
    });
  } catch (error) {
    logger.error('Error initializing GPUs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'initialization_failed',
        message: 'Failed to initialize GPUs'
      }
    });
  }
});

/**
 * Update GPU allocation policy
 * PATCH /api/gpu/:id/policy
 */
router.patch('/:id/policy', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { policy } = req.body;

    if (!policy) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_policy',
          message: 'policy is required'
        }
      });
    }

    await gpuManager.updateAllocationPolicy(parseInt(id), policy);

    res.json({
      success: true,
      message: 'GPU allocation policy updated'
    });
  } catch (error) {
    logger.error('Error updating GPU policy:', error);

    if (error.message.includes('Invalid allocation policy')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_policy',
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update GPU policy'
      }
    });
  }
});

/**
 * Set GPU availability
 * PATCH /api/gpu/:id/availability
 */
router.patch('/:id/availability', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    if (is_available === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_availability',
          message: 'is_available is required'
        }
      });
    }

    await gpuManager.setGPUAvailability(parseInt(id), is_available);

    res.json({
      success: true,
      message: 'GPU availability updated'
    });
  } catch (error) {
    logger.error('Error updating GPU availability:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update GPU availability'
      }
    });
  }
});

/**
 * Get GPU usage logs
 * GET /api/gpu/:id/usage
 */
router.get('/:id/usage', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT * FROM gpu_usage_logs
      WHERE gpu_resource_id = $1
      ORDER BY logged_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM gpu_usage_logs WHERE gpu_resource_id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        usage_logs: result.rows,
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    logger.error('Error getting GPU usage logs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_usage_failed',
        message: 'Failed to get GPU usage logs'
      }
    });
  }
});

/**
 * Get containers using GPU
 * GET /api/gpu/:id/containers
 */
router.get('/:id/containers', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM containers
      WHERE gpu_resource_id = $1
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: { containers: result.rows }
    });
  } catch (error) {
    logger.error('Error getting GPU containers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_containers_failed',
        message: 'Failed to get GPU containers'
      }
    });
  }
});

/**
 * Get optimal GPU for allocation
 * GET /api/gpu/optimal
 */
router.get('/meta/optimal', authenticateApiKey, async (req, res) => {
  try {
    const { memory_mb = 0 } = req.query;

    const gpu = await gpuManager.getOptimalGPU(parseInt(memory_mb));

    res.json({
      success: true,
      data: { gpu }
    });
  } catch (error) {
    logger.error('Error getting optimal GPU:', error);

    if (error.message === 'No suitable GPU available') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'no_gpu_available',
          message: 'No suitable GPU available'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'get_optimal_failed',
        message: 'Failed to get optimal GPU'
      }
    });
  }
});

/**
 * Manually allocate GPU to container
 * POST /api/gpu/:id/allocate
 */
router.post('/:id/allocate', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { container_id, memory_limit_mb } = req.body;

    if (!container_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_container_id',
          message: 'container_id is required'
        }
      });
    }

    // Check if GPU exists
    const gpuResult = await pool.query(
      'SELECT * FROM gpu_resources WHERE id = $1',
      [id]
    );

    if (gpuResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'gpu_not_found',
          message: 'GPU resource not found'
        }
      });
    }

    const gpu = gpuResult.rows[0];

    await gpuManager.allocateGPU(
      container_id,
      memory_limit_mb,
      gpu.allocation_policy
    );

    res.json({
      success: true,
      message: 'GPU allocated to container'
    });
  } catch (error) {
    logger.error('Error allocating GPU:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'allocation_failed',
        message: error.message || 'Failed to allocate GPU'
      }
    });
  }
});

/**
 * Release GPU from container
 * POST /api/gpu/release/:containerId
 */
router.post('/release/:containerId', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { containerId } = req.params;

    await gpuManager.releaseGPU(parseInt(containerId));

    res.json({
      success: true,
      message: 'GPU released from container'
    });
  } catch (error) {
    logger.error('Error releasing GPU:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'release_failed',
        message: 'Failed to release GPU'
      }
    });
  }
});

/**
 * Get GPU utilization summary
 * GET /api/gpu/meta/summary
 */
router.get('/meta/summary', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_gpus,
        SUM(CASE WHEN is_available = true THEN 1 ELSE 0 END) as available_gpus,
        SUM(total_memory_mb) as total_memory_mb,
        SUM(allocated_memory_mb) as allocated_memory_mb,
        (SELECT COUNT(*) FROM containers WHERE gpu_resource_id IS NOT NULL AND status = 'running') as containers_using_gpu
      FROM gpu_resources
    `);

    const summary = result.rows[0];

    // Get average utilization from recent logs
    const utilizationResult = await pool.query(`
      SELECT AVG(utilization_percent) as avg_utilization
      FROM gpu_usage_logs
      WHERE logged_at > NOW() - INTERVAL '5 minutes'
    `);

    res.json({
      success: true,
      data: {
        total_gpus: parseInt(summary.total_gpus) || 0,
        available_gpus: parseInt(summary.available_gpus) || 0,
        total_memory_mb: parseInt(summary.total_memory_mb) || 0,
        allocated_memory_mb: parseInt(summary.allocated_memory_mb) || 0,
        available_memory_mb: (parseInt(summary.total_memory_mb) || 0) - (parseInt(summary.allocated_memory_mb) || 0),
        containers_using_gpu: parseInt(summary.containers_using_gpu) || 0,
        avg_utilization_percent: parseFloat(utilizationResult.rows[0].avg_utilization) || 0
      }
    });
  } catch (error) {
    logger.error('Error getting GPU summary:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_summary_failed',
        message: 'Failed to get GPU summary'
      }
    });
  }
});

module.exports = router;
