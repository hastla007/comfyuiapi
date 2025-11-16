const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../database');
const storageService = require('../services/storageService');
const { authenticateApiKey } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const logger = require('../utils/logger');
const Joi = require('joi');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  }
});

/**
 * Storage backend creation schema
 */
const createBackendSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  type: Joi.string().valid('s3', 'minio', 'local', 'azure', 'gcs').required(),
  config: Joi.object().required(),
  is_default: Joi.boolean().default(false)
});

// ===================================
// Storage Backends (Admin Only)
// ===================================

/**
 * Create storage backend
 * POST /api/storage/backends
 */
router.post('/backends', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { error, value } = createBackendSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const backend = await storageService.createStorageBackend(
      value.name,
      value.type,
      value.config,
      value.is_default
    );

    res.status(201).json({
      success: true,
      data: { backend }
    });
  } catch (error) {
    logger.error('Error creating storage backend:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: error.message || 'Failed to create storage backend'
      }
    });
  }
});

/**
 * List storage backends
 * GET /api/storage/backends
 */
router.get('/backends', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sb.*,
        COUNT(mf.id) as file_count,
        SUM(mf.size_bytes) as total_size_bytes
      FROM storage_backends sb
      LEFT JOIN media_files mf ON sb.id = mf.storage_backend_id
      GROUP BY sb.id
      ORDER BY sb.created_at DESC
    `);

    res.json({
      success: true,
      data: { backends: result.rows }
    });
  } catch (error) {
    logger.error('Error listing storage backends:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list storage backends'
      }
    });
  }
});

/**
 * Get storage backend by ID
 * GET /api/storage/backends/:id
 */
router.get('/backends/:id', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const backend = await storageService.getBackendById(parseInt(id));

    res.json({
      success: true,
      data: { backend }
    });
  } catch (error) {
    logger.error('Error getting storage backend:', error);
    res.status(404).json({
      success: false,
      error: {
        code: 'not_found',
        message: 'Storage backend not found'
      }
    });
  }
});

/**
 * Update storage backend
 * PATCH /api/storage/backends/:id
 */
router.patch('/backends/:id', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, config, is_default, is_active } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (config) {
      updates.push(`config = $${paramIndex}`);
      values.push(config);
      paramIndex++;
    }

    if (is_default !== undefined) {
      updates.push(`is_default = $${paramIndex}`);
      values.push(is_default);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'no_updates',
          message: 'No valid fields to update'
        }
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE storage_backends
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Storage backend not found'
        }
      });
    }

    res.json({
      success: true,
      data: { backend: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error updating storage backend:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update storage backend'
      }
    });
  }
});

/**
 * Delete storage backend
 * DELETE /api/storage/backends/:id
 */
router.delete('/backends/:id', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if backend has files
    const fileCheck = await pool.query(
      'SELECT COUNT(*) as count FROM media_files WHERE storage_backend_id = $1',
      [id]
    );

    if (parseInt(fileCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'backend_in_use',
          message: 'Cannot delete storage backend that contains files'
        }
      });
    }

    const result = await pool.query(
      'DELETE FROM storage_backends WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Storage backend not found'
        }
      });
    }

    res.json({
      success: true,
      message: 'Storage backend deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting storage backend:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete storage backend'
      }
    });
  }
});

// ===================================
// File Management
// ===================================

/**
 * Upload file
 * POST /api/storage/files
 */
router.post('/files', authenticateApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'no_file',
          message: 'No file uploaded'
        }
      });
    }

    const { job_id, backend_id } = req.body;

    const file = await storageService.uploadFile(
      req.user.id,
      job_id ? parseInt(job_id) : null,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype,
      backend_id ? parseInt(backend_id) : null
    );

    res.status(201).json({
      success: true,
      data: { file }
    });
  } catch (error) {
    logger.error('Error uploading file:', error);

    if (error.code === 'QUOTA_EXCEEDED') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'quota_exceeded',
          message: 'Storage quota exceeded'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'upload_failed',
        message: 'Failed to upload file'
      }
    });
  }
});

/**
 * List user files
 * GET /api/storage/files
 */
router.get('/files', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 50, offset = 0, job_id } = req.query;

    const result = await storageService.listUserFiles(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      jobId: job_id ? parseInt(job_id) : undefined
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error listing files:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list files'
      }
    });
  }
});

/**
 * Get file details
 * GET /api/storage/files/:id
 */
router.get('/files/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM media_files WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'File not found'
        }
      });
    }

    res.json({
      success: true,
      data: { file: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error getting file:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get file'
      }
    });
  }
});

/**
 * Get file URL
 * GET /api/storage/files/:id/url
 */
router.get('/files/:id/url', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { expires_in = 3600 } = req.query;

    const url = await storageService.getFileUrl(
      parseInt(id),
      req.user.id,
      parseInt(expires_in)
    );

    res.json({
      success: true,
      data: {
        url,
        expires_in: parseInt(expires_in)
      }
    });
  } catch (error) {
    logger.error('Error getting file URL:', error);

    if (error.message === 'File not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'File not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'get_url_failed',
        message: 'Failed to get file URL'
      }
    });
  }
});

/**
 * Delete file
 * DELETE /api/storage/files/:id
 */
router.delete('/files/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    await storageService.deleteFile(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting file:', error);

    if (error.message === 'File not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'File not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete file'
      }
    });
  }
});

/**
 * Get storage statistics
 * GET /api/storage/stats
 */
router.get('/stats', authenticateApiKey, async (req, res) => {
  try {
    const stats = await storageService.getUserStorageStats(req.user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting storage stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_stats_failed',
        message: 'Failed to get storage statistics'
      }
    });
  }
});

module.exports = router;
