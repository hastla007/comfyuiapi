const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateApiKey } = require('../middleware/auth');
const { requireOrganizationRole, requireOrganizationMembership } = require('../middleware/rbac');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Organization creation schema
 */
const createOrgSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  slug: Joi.string().min(2).max(255).pattern(/^[a-z0-9-]+$/).required(),
  description: Joi.string().max(1000).optional()
});

/**
 * Create a new organization
 * POST /api/organizations
 */
router.post('/', authenticateApiKey, async (req, res) => {
  const client = await pool.connect();

  try {
    // Validate request body
    const { error, value } = createOrgSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: error.details[0].message
        }
      });
    }

    const { name, slug, description } = value;

    await client.query('BEGIN');

    // Check if slug is already taken
    const slugCheck = await client.query(
      'SELECT id FROM organizations WHERE slug = $1',
      [slug]
    );

    if (slugCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: {
          code: 'slug_taken',
          message: 'Organization slug is already taken'
        }
      });
    }

    // Create organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, slug, description, owner_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, slug, description, req.user.id]);

    const organization = orgResult.rows[0];

    // Add creator as owner in organization_members
    await client.query(`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `, [organization.id, req.user.id]);

    await client.query('COMMIT');

    logger.info('Organization created', {
      organizationId: organization.id,
      userId: req.user.id,
      slug
    });

    res.status(201).json({
      success: true,
      data: { organization }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'creation_failed',
        message: 'Failed to create organization'
      }
    });
  } finally {
    client.release();
  }
});

/**
 * Get all organizations for current user
 * GET /api/organizations
 */
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, om.role as user_role,
             (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: { organizations: result.rows }
    });
  } catch (error) {
    logger.error('Error listing organizations:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list organizations'
      }
    });
  }
});

/**
 * Get organization by ID
 * GET /api/organizations/:organizationId
 */
router.get('/:organizationId', authenticateApiKey, requireOrganizationMembership(), async (req, res) => {
  try {
    const { organizationId } = req.params;

    const result = await pool.query(`
      SELECT o.*,
             u.name as owner_name,
             u.email as owner_email,
             (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
      FROM organizations o
      LEFT JOIN users u ON o.owner_user_id = u.id
      WHERE o.id = $1
    `, [organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'not_found',
          message: 'Organization not found'
        }
      });
    }

    res.json({
      success: true,
      data: { organization: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error getting organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'get_failed',
        message: 'Failed to get organization'
      }
    });
  }
});

/**
 * Update organization
 * PATCH /api/organizations/:organizationId
 */
router.patch('/:organizationId', authenticateApiKey, requireOrganizationRole(['owner', 'admin']), async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, description } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
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
    values.push(organizationId);

    const query = `
      UPDATE organizations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    logger.info('Organization updated', {
      organizationId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: { organization: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error updating organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update organization'
      }
    });
  }
});

/**
 * Delete organization
 * DELETE /api/organizations/:organizationId
 */
router.delete('/:organizationId', authenticateApiKey, requireOrganizationRole(['owner']), async (req, res) => {
  try {
    const { organizationId } = req.params;

    await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);

    logger.info('Organization deleted', {
      organizationId,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'delete_failed',
        message: 'Failed to delete organization'
      }
    });
  }
});

/**
 * Get organization members
 * GET /api/organizations/:organizationId/members
 */
router.get('/:organizationId/members', authenticateApiKey, requireOrganizationMembership(), async (req, res) => {
  try {
    const { organizationId } = req.params;

    const result = await pool.query(`
      SELECT om.*, u.email, u.name, u.avatar_url
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = $1
      ORDER BY om.joined_at DESC
    `, [organizationId]);

    res.json({
      success: true,
      data: { members: result.rows }
    });
  } catch (error) {
    logger.error('Error listing members:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'list_failed',
        message: 'Failed to list members'
      }
    });
  }
});

/**
 * Add member to organization
 * POST /api/organizations/:organizationId/members
 */
router.post('/:organizationId/members', authenticateApiKey, requireOrganizationRole(['owner', 'admin']), async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { user_id, role = 'member' } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_user_id',
          message: 'user_id is required'
        }
      });
    }

    // Validate role
    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_role',
          message: 'Role must be member or admin'
        }
      });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'user_not_found',
          message: 'User not found'
        }
      });
    }

    // Add member
    const result = await pool.query(`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = $3, joined_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [organizationId, user_id, role]);

    logger.info('Member added to organization', {
      organizationId,
      userId: user_id,
      role,
      addedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: { member: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error adding member:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'add_failed',
        message: 'Failed to add member'
      }
    });
  }
});

/**
 * Update member role
 * PATCH /api/organizations/:organizationId/members/:userId
 */
router.patch('/:organizationId/members/:userId', authenticateApiKey, requireOrganizationRole(['owner', 'admin']), async (req, res) => {
  try {
    const { organizationId, userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'missing_role',
          message: 'role is required'
        }
      });
    }

    // Validate role
    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'invalid_role',
          message: 'Role must be member or admin'
        }
      });
    }

    // Cannot change owner's role
    const orgCheck = await pool.query(
      'SELECT owner_user_id FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (orgCheck.rows.length > 0 && orgCheck.rows[0].owner_user_id === parseInt(userId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'cannot_change_owner',
          message: 'Cannot change organization owner role'
        }
      });
    }

    const result = await pool.query(`
      UPDATE organization_members
      SET role = $1
      WHERE organization_id = $2 AND user_id = $3
      RETURNING *
    `, [role, organizationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'member_not_found',
          message: 'Member not found'
        }
      });
    }

    logger.info('Member role updated', {
      organizationId,
      userId,
      role,
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      data: { member: result.rows[0] }
    });
  } catch (error) {
    logger.error('Error updating member role:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'update_failed',
        message: 'Failed to update member role'
      }
    });
  }
});

/**
 * Remove member from organization
 * DELETE /api/organizations/:organizationId/members/:userId
 */
router.delete('/:organizationId/members/:userId', authenticateApiKey, requireOrganizationRole(['owner', 'admin']), async (req, res) => {
  try {
    const { organizationId, userId } = req.params;

    // Cannot remove owner
    const orgCheck = await pool.query(
      'SELECT owner_user_id FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (orgCheck.rows.length > 0 && orgCheck.rows[0].owner_user_id === parseInt(userId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'cannot_remove_owner',
          message: 'Cannot remove organization owner'
        }
      });
    }

    const result = await pool.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'member_not_found',
          message: 'Member not found'
        }
      });
    }

    logger.info('Member removed from organization', {
      organizationId,
      userId,
      removedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    logger.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'remove_failed',
        message: 'Failed to remove member'
      }
    });
  }
});

/**
 * Leave organization
 * POST /api/organizations/:organizationId/leave
 */
router.post('/:organizationId/leave', authenticateApiKey, requireOrganizationMembership(), async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Cannot leave if you're the owner
    const orgCheck = await pool.query(
      'SELECT owner_user_id FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (orgCheck.rows.length > 0 && orgCheck.rows[0].owner_user_id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'owner_cannot_leave',
          message: 'Organization owner cannot leave. Transfer ownership or delete the organization.'
        }
      });
    }

    await pool.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, req.user.id]
    );

    logger.info('User left organization', {
      organizationId,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Left organization successfully'
    });
  } catch (error) {
    logger.error('Error leaving organization:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'leave_failed',
        message: 'Failed to leave organization'
      }
    });
  }
});

module.exports = router;
