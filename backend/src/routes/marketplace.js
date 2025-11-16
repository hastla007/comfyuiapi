const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const marketplaceService = require('../services/marketplaceService');
const { authenticateApiKey } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Publish workflow schema
 */
const publishWorkflowSchema = Joi.object({
  workflow_id: Joi.number().integer().required(),
  title: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(2000).optional(),
  category: Joi.string().max(100).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  version: Joi.string().max(50).optional().default('1.0.0')
});

/**
 * Browse marketplace workflows
 * GET /api/marketplace
 */
router.get('/', async (req, res) => {
  try {
    const {
      category,
      tags,
      search,
      sort = 'popular',
      limit = 20,
      offset = 0,
      featured
    } = req.query;

    const options = {
      category,
      tags: tags ? tags.split(',') : undefined,
      search,
      sort,
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
      featured: featured === 'true'
    };

    const result = await marketplaceService.browseWorkflows(options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error browsing marketplace:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'browse_failed',
        message: 'Failed to browse marketplace'
      }
    });
  }
});

/**
 * Get marketplace workflow by ID
 * GET /api/marketplace/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const workflow = await marketplaceService.getWorkflowById(parseInt(id));

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    res.json({
      success: true,
      data: { workflow }
    });
  } catch (error) {
    logger.error('Error getting marketplace workflow:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get workflow'
      }
    });
  }
});

/**
 * Publish a workflow to marketplace
 * POST /api/marketplace
 */
router.post('/', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = publishWorkflowSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const marketplaceWorkflow = await marketplaceService.publishWorkflow(
      value.workflow_id,
      req.user.id,
      {
        title: value.title,
        description: value.description,
        category: value.category,
        tags: value.tags,
        version: value.version
      }
    );

    res.status(201).json({
      success: true,
      data: { workflow: marketplaceWorkflow }
    });
  } catch (error) {
    logger.error('Error publishing workflow:', error);

    if (error.code === 'WORKFLOW_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'workflow_not_found',
          message: 'Workflow not found'
        }
      });
    }

    if (error.code === 'ALREADY_PUBLISHED') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'already_published',
          message: 'Workflow is already published'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'publish_failed',
        message: 'Failed to publish workflow'
      }
    });
  }
});

/**
 * Update published workflow
 * PATCH /api/marketplace/:id
 */
router.patch('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, tags, is_published } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category) updateData.category = category;
    if (tags) updateData.tags = tags;
    if (is_published !== undefined) updateData.is_published = is_published;

    const workflow = await marketplaceService.updateWorkflow(
      parseInt(id),
      req.user.id,
      updateData
    );

    res.json({
      success: true,
      data: { workflow }
    });
  } catch (error) {
    logger.error('Error updating marketplace workflow:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'You do not have permission to update this workflow'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update workflow'
      }
    });
  }
});

/**
 * Delete published workflow
 * DELETE /api/marketplace/:id
 */
router.delete('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    await marketplaceService.deleteWorkflow(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting marketplace workflow:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'You do not have permission to delete this workflow'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete workflow'
      }
    });
  }
});

/**
 * Download/install workflow from marketplace
 * POST /api/marketplace/:id/download
 */
router.post('/:id/download', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const workflow = await marketplaceService.downloadWorkflow(
      parseInt(id),
      req.user.id
    );

    res.json({
      success: true,
      data: { workflow }
    });
  } catch (error) {
    logger.error('Error downloading workflow:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'download_failed',
        message: 'Failed to download workflow'
      }
    });
  }
});

/**
 * Rate a workflow
 * POST /api/marketplace/:id/rate
 */
router.post('/:id/rate', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_rating',
          message: 'Rating must be between 1 and 5'
        }
      });
    }

    const result = await marketplaceService.rateWorkflow(
      parseInt(id),
      req.user.id,
      rating,
      review
    );

    res.json({
      success: true,
      data: { rating: result }
    });
  } catch (error) {
    logger.error('Error rating workflow:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'rating_failed',
        message: 'Failed to rate workflow'
      }
    });
  }
});

/**
 * Get workflow ratings
 * GET /api/marketplace/:id/ratings
 */
router.get('/:id/ratings', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const result = await marketplaceService.getWorkflowRatings(
      parseInt(id),
      {
        limit: Math.min(parseInt(limit) || 10, 100),
        offset: parseInt(offset) || 0
      }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting ratings:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_ratings_failed',
        message: 'Failed to get ratings'
      }
    });
  }
});

/**
 * Get workflow versions
 * GET /api/marketplace/:id/versions
 */
router.get('/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;

    const versions = await marketplaceService.getWorkflowVersions(parseInt(id));

    res.json({
      success: true,
      data: { versions }
    });
  } catch (error) {
    logger.error('Error getting versions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_versions_failed',
        message: 'Failed to get versions'
      }
    });
  }
});

/**
 * Publish new version of workflow
 * POST /api/marketplace/:id/versions
 */
router.post('/:id/versions', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { version, changelog, workflow_json } = req.body;

    if (!version || !workflow_json) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_fields',
          message: 'version and workflow_json are required'
        }
      });
    }

    const newVersion = await marketplaceService.publishNewVersion(
      parseInt(id),
      req.user.id,
      {
        version,
        changelog,
        workflow_json
      }
    );

    res.status(201).json({
      success: true,
      data: { version: newVersion }
    });
  } catch (error) {
    logger.error('Error publishing version:', error);

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Workflow not found'
        }
      });
    }

    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'unauthorized',
          message: 'You do not have permission to publish versions for this workflow'
        }
      });
    }

    if (error.code === 'VERSION_EXISTS') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'version_exists',
          message: 'This version already exists'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'publish_version_failed',
        message: 'Failed to publish version'
      }
    });
  }
});

/**
 * Get marketplace categories
 * GET /api/marketplace/meta/categories
 */
router.get('/meta/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM marketplace_workflows
      WHERE is_published = true AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: { categories: result.rows }
    });
  } catch (error) {
    logger.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_categories_failed',
        message: 'Failed to get categories'
      }
    });
  }
});

/**
 * Get popular tags
 * GET /api/marketplace/meta/tags
 */
router.get('/meta/tags', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT UNNEST(tags) as tag, COUNT(*) as count
      FROM marketplace_workflows
      WHERE is_published = true AND tags IS NOT NULL
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      data: { tags: result.rows }
    });
  } catch (error) {
    logger.error('Error getting tags:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_tags_failed',
        message: 'Failed to get tags'
      }
    });
  }
});

/**
 * Feature a workflow (Admin only)
 * POST /api/marketplace/:id/feature
 */
router.post('/:id/feature', authenticateApiKey, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE marketplace_workflows SET is_featured = true WHERE id = $1',
      [id]
    );

    logger.info('Workflow featured', { workflowId: id, by: req.user.id });

    res.json({
      success: true,
      message: 'Workflow featured successfully'
    });
  } catch (error) {
    logger.error('Error featuring workflow:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'feature_failed',
        message: 'Failed to feature workflow'
      }
    });
  }
});

module.exports = router;
