const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Marketplace Service
 * Handles business logic for the workflow marketplace
 */

/**
 * Browse marketplace workflows with filtering and sorting
 * @param {Object} options - Browse options
 * @returns {Promise<Object>} Paginated workflows list
 */
async function browseWorkflows(options = {}) {
  const {
    category,
    tags,
    search,
    sort = 'popular',
    limit = 20,
    offset = 0,
    featured = false
  } = options;

  let query = `
    SELECT mw.*,
           u.name as author_name,
           u.email as author_email,
           w.workflow_json,
           COALESCE(AVG(wr.rating), 0) as avg_rating,
           COUNT(DISTINCT wr.id) as rating_count
    FROM marketplace_workflows mw
    LEFT JOIN users u ON mw.author_user_id = u.id
    LEFT JOIN workflows w ON mw.workflow_id = w.id
    LEFT JOIN workflow_ratings wr ON mw.id = wr.marketplace_workflow_id
    WHERE mw.is_published = true
  `;

  const params = [];
  let paramIndex = 1;

  // Filter by category
  if (category) {
    query += ` AND mw.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    query += ` AND mw.tags && $${paramIndex}::text[]`;
    params.push(tags);
    paramIndex++;
  }

  // Filter by search term
  if (search) {
    query += ` AND (mw.title ILIKE $${paramIndex} OR mw.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Filter by featured
  if (featured) {
    query += ` AND mw.is_featured = true`;
  }

  query += ' GROUP BY mw.id, u.name, u.email, w.workflow_json';

  // Sorting
  switch (sort) {
    case 'popular':
      query += ' ORDER BY mw.downloads_count DESC, avg_rating DESC';
      break;
    case 'rating':
      query += ' ORDER BY avg_rating DESC, rating_count DESC';
      break;
    case 'recent':
      query += ' ORDER BY mw.published_at DESC';
      break;
    case 'downloads':
      query += ' ORDER BY mw.downloads_count DESC';
      break;
    default:
      query += ' ORDER BY mw.created_at DESC';
  }

  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total
    FROM marketplace_workflows mw
    WHERE mw.is_published = true
  `;

  const countParams = [];
  let countParamIndex = 1;

  if (category) {
    countQuery += ` AND mw.category = $${countParamIndex}`;
    countParams.push(category);
    countParamIndex++;
  }

  if (tags && tags.length > 0) {
    countQuery += ` AND mw.tags && $${countParamIndex}::text[]`;
    countParams.push(tags);
    countParamIndex++;
  }

  if (search) {
    countQuery += ` AND (mw.title ILIKE $${countParamIndex} OR mw.description ILIKE $${countParamIndex})`;
    countParams.push(`%${search}%`);
  }

  if (featured) {
    countQuery += ` AND mw.is_featured = true`;
  }

  const countResult = await pool.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  return {
    workflows: result.rows,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + limit < total
    }
  };
}

/**
 * Get marketplace workflow by ID with details
 * @param {number} id - Marketplace workflow ID
 * @returns {Promise<Object>} Workflow details
 */
async function getWorkflowById(id) {
  const result = await pool.query(`
    SELECT mw.*,
           u.name as author_name,
           u.email as author_email,
           u.avatar_url as author_avatar,
           w.workflow_json,
           COALESCE(AVG(wr.rating), 0) as avg_rating,
           COUNT(DISTINCT wr.id) as rating_count
    FROM marketplace_workflows mw
    LEFT JOIN users u ON mw.author_user_id = u.id
    LEFT JOIN workflows w ON mw.workflow_id = w.id
    LEFT JOIN workflow_ratings wr ON mw.id = wr.marketplace_workflow_id
    WHERE mw.id = $1 AND mw.is_published = true
    GROUP BY mw.id, u.name, u.email, u.avatar_url, w.workflow_json
  `, [id]);

  return result.rows[0] || null;
}

/**
 * Publish a workflow to the marketplace
 * @param {number} workflowId - Workflow ID
 * @param {number} authorUserId - Author user ID
 * @param {Object} metadata - Workflow metadata
 * @returns {Promise<Object>} Published marketplace workflow
 */
async function publishWorkflow(workflowId, authorUserId, metadata) {
  const client = await pool.connect();

  try {
    // Verify workflow exists
    const workflowResult = await client.query(
      'SELECT id, workflow_json FROM workflows WHERE id = $1',
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'WORKFLOW_NOT_FOUND';
      throw error;
    }

    // Check if already published
    const existingResult = await client.query(
      'SELECT id FROM marketplace_workflows WHERE workflow_id = $1',
      [workflowId]
    );

    if (existingResult.rows.length > 0) {
      const error = new Error('Workflow already published');
      error.code = 'ALREADY_PUBLISHED';
      throw error;
    }

    await client.query('BEGIN');

    // Create marketplace workflow
    const result = await client.query(`
      INSERT INTO marketplace_workflows (
        workflow_id, author_user_id, title, description,
        category, tags, version, is_published, published_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      workflowId,
      authorUserId,
      metadata.title,
      metadata.description || null,
      metadata.category || null,
      metadata.tags || null,
      metadata.version || '1.0.0'
    ]);

    const marketplaceWorkflow = result.rows[0];

    // Create initial version
    await client.query(`
      INSERT INTO workflow_versions (
        marketplace_workflow_id, version, workflow_json, changelog
      )
      VALUES ($1, $2, $3, $4)
    `, [
      marketplaceWorkflow.id,
      metadata.version || '1.0.0',
      workflowResult.rows[0].workflow_json,
      'Initial release'
    ]);

    await client.query('COMMIT');

    logger.info('Workflow published to marketplace', {
      marketplaceWorkflowId: marketplaceWorkflow.id,
      workflowId,
      authorUserId
    });

    return marketplaceWorkflow;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update marketplace workflow
 * @param {number} id - Marketplace workflow ID
 * @param {number} userId - User ID (must be author or admin)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated workflow
 */
async function updateWorkflow(id, userId, updateData) {
  const client = await pool.connect();

  try {
    // Check ownership
    const checkResult = await client.query(
      'SELECT author_user_id FROM marketplace_workflows WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (checkResult.rows[0].author_user_id !== userId) {
      // Check if user is admin
      const userResult = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0 || !['admin', 'super_admin'].includes(userResult.rows[0].role)) {
        const error = new Error('Unauthorized');
        error.code = 'UNAUTHORIZED';
        throw error;
      }
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['title', 'description', 'category', 'tags', 'is_published'];

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      const error = new Error('No valid fields to update');
      error.code = 'NO_UPDATES';
      throw error;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE marketplace_workflows
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await client.query(query, values);

    logger.info('Marketplace workflow updated', { workflowId: id, userId });

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Delete marketplace workflow
 * @param {number} id - Marketplace workflow ID
 * @param {number} userId - User ID (must be author or admin)
 */
async function deleteWorkflow(id, userId) {
  const client = await pool.connect();

  try {
    // Check ownership
    const checkResult = await client.query(
      'SELECT author_user_id FROM marketplace_workflows WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (checkResult.rows[0].author_user_id !== userId) {
      // Check if user is admin
      const userResult = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0 || !['admin', 'super_admin'].includes(userResult.rows[0].role)) {
        const error = new Error('Unauthorized');
        error.code = 'UNAUTHORIZED';
        throw error;
      }
    }

    await client.query('DELETE FROM marketplace_workflows WHERE id = $1', [id]);

    logger.info('Marketplace workflow deleted', { workflowId: id, userId });
  } finally {
    client.release();
  }
}

/**
 * Download/install workflow from marketplace
 * @param {number} id - Marketplace workflow ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Workflow data
 */
async function downloadWorkflow(id, userId) {
  const client = await pool.connect();

  try {
    // Get workflow
    const result = await client.query(`
      SELECT mw.*, w.workflow_json
      FROM marketplace_workflows mw
      JOIN workflows w ON mw.workflow_id = w.id
      WHERE mw.id = $1 AND mw.is_published = true
    `, [id]);

    if (result.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Increment download count
    await client.query(
      'UPDATE marketplace_workflows SET downloads_count = downloads_count + 1 WHERE id = $1',
      [id]
    );

    logger.info('Workflow downloaded', { workflowId: id, userId });

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Rate a marketplace workflow
 * @param {number} workflowId - Marketplace workflow ID
 * @param {number} userId - User ID
 * @param {number} rating - Rating (1-5)
 * @param {string} review - Optional review text
 * @returns {Promise<Object>} Rating record
 */
async function rateWorkflow(workflowId, userId, rating, review = null) {
  const client = await pool.connect();

  try {
    // Check if workflow exists
    const workflowCheck = await client.query(
      'SELECT id FROM marketplace_workflows WHERE id = $1 AND is_published = true',
      [workflowId]
    );

    if (workflowCheck.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Upsert rating
    const result = await client.query(`
      INSERT INTO workflow_ratings (marketplace_workflow_id, user_id, rating, review)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (marketplace_workflow_id, user_id)
      DO UPDATE SET rating = $3, review = $4, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [workflowId, userId, rating, review]);

    logger.info('Workflow rated', { workflowId, userId, rating });

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get ratings for a workflow
 * @param {number} workflowId - Marketplace workflow ID
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Ratings list
 */
async function getWorkflowRatings(workflowId, options = {}) {
  const { limit = 10, offset = 0 } = options;

  const result = await pool.query(`
    SELECT wr.*, u.name as user_name, u.avatar_url as user_avatar
    FROM workflow_ratings wr
    JOIN users u ON wr.user_id = u.id
    WHERE wr.marketplace_workflow_id = $1
    ORDER BY wr.created_at DESC
    LIMIT $2 OFFSET $3
  `, [workflowId, limit, offset]);

  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM workflow_ratings WHERE marketplace_workflow_id = $1',
    [workflowId]
  );

  return {
    ratings: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Get versions for a workflow
 * @param {number} workflowId - Marketplace workflow ID
 * @returns {Promise<Array>} List of versions
 */
async function getWorkflowVersions(workflowId) {
  const result = await pool.query(`
    SELECT id, version, changelog, created_at
    FROM workflow_versions
    WHERE marketplace_workflow_id = $1
    ORDER BY created_at DESC
  `, [workflowId]);

  return result.rows;
}

/**
 * Publish new version of workflow
 * @param {number} workflowId - Marketplace workflow ID
 * @param {number} userId - User ID
 * @param {Object} versionData - Version data
 * @returns {Promise<Object>} New version record
 */
async function publishNewVersion(workflowId, userId, versionData) {
  const client = await pool.connect();

  try {
    // Check ownership
    const checkResult = await client.query(
      'SELECT author_user_id FROM marketplace_workflows WHERE id = $1',
      [workflowId]
    );

    if (checkResult.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (checkResult.rows[0].author_user_id !== userId) {
      const error = new Error('Unauthorized');
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    // Check if version already exists
    const versionCheck = await client.query(
      'SELECT id FROM workflow_versions WHERE marketplace_workflow_id = $1 AND version = $2',
      [workflowId, versionData.version]
    );

    if (versionCheck.rows.length > 0) {
      const error = new Error('Version already exists');
      error.code = 'VERSION_EXISTS';
      throw error;
    }

    await client.query('BEGIN');

    // Create new version
    const result = await client.query(`
      INSERT INTO workflow_versions (
        marketplace_workflow_id, version, workflow_json, changelog
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [workflowId, versionData.version, versionData.workflow_json, versionData.changelog || null]);

    // Update marketplace workflow version
    await client.query(
      'UPDATE marketplace_workflows SET version = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [versionData.version, workflowId]
    );

    await client.query('COMMIT');

    logger.info('New workflow version published', {
      workflowId,
      version: versionData.version,
      userId
    });

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  browseWorkflows,
  getWorkflowById,
  publishWorkflow,
  updateWorkflow,
  deleteWorkflow,
  downloadWorkflow,
  rateWorkflow,
  getWorkflowRatings,
  getWorkflowVersions,
  publishNewVersion
};
