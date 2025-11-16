const crypto = require('crypto');
const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Batch Job Service
 * Handles creation and management of batch job operations
 */

/**
 * Create a batch of jobs
 * @param {number} workflowId - Workflow ID
 * @param {number} userId - User ID
 * @param {Array} jobs - Array of job specifications
 * @param {string} batchName - Optional batch name
 * @returns {Promise<Object>} Batch creation result
 */
async function createBatchJobs(workflowId, userId, jobs, batchName = null) {
  const client = await pool.connect();

  try {
    // Verify workflow exists
    const workflowResult = await client.query(
      'SELECT id FROM workflows WHERE id = $1',
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      const error = new Error('Workflow not found');
      error.code = 'WORKFLOW_NOT_FOUND';
      throw error;
    }

    await client.query('BEGIN');

    // Generate unique batch ID
    const batchId = `batch_${crypto.randomBytes(16).toString('hex')}`;

    const createdJobs = [];

    // Create all jobs in the batch
    for (const job of jobs) {
      const result = await client.query(`
        INSERT INTO jobs (
          workflow_id,
          user_id,
          parameters,
          priority,
          batch_id,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'queued')
        RETURNING *
      `, [
        workflowId,
        userId,
        job.parameters,
        job.priority || 0,
        batchId
      ]);

      createdJobs.push(result.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Batch jobs created', {
      batchId,
      count: createdJobs.length,
      userId,
      workflowId
    });

    return {
      batch_id: batchId,
      batch_name: batchName,
      total_jobs: createdJobs.length,
      jobs: createdJobs,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get batch job status
 * @param {string} batchId - Batch ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Batch status
 */
async function getBatchStatus(batchId, userId) {
  const client = await pool.connect();

  try {
    // Get all jobs in batch
    const jobsResult = await client.query(`
      SELECT *
      FROM jobs
      WHERE batch_id = $1 AND user_id = $2
      ORDER BY created_at ASC
    `, [batchId, userId]);

    if (jobsResult.rows.length === 0) {
      const error = new Error('Batch not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const jobs = jobsResult.rows;

    // Calculate statistics
    const stats = {
      total: jobs.length,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    jobs.forEach(job => {
      stats[job.status]++;
    });

    // Calculate progress percentage
    const progress = Math.round(
      ((stats.completed + stats.failed + stats.cancelled) / stats.total) * 100
    );

    // Determine overall batch status
    let batchStatus = 'processing';
    if (stats.completed === stats.total) {
      batchStatus = 'completed';
    } else if (stats.failed + stats.cancelled === stats.total) {
      batchStatus = 'failed';
    } else if (stats.queued === stats.total) {
      batchStatus = 'queued';
    }

    return {
      batch_id: batchId,
      status: batchStatus,
      progress,
      stats,
      jobs: jobs.map(job => ({
        id: job.id,
        status: job.status,
        priority: job.priority,
        progress: job.progress,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        error_message: job.error_message
      })),
      created_at: jobs[0].created_at
    };
  } finally {
    client.release();
  }
}

/**
 * Cancel all jobs in a batch
 * @param {string} batchId - Batch ID
 * @param {number} userId - User ID
 */
async function cancelBatch(batchId, userId) {
  const client = await pool.connect();

  try {
    // Verify batch exists and belongs to user
    const checkResult = await client.query(
      'SELECT id FROM jobs WHERE batch_id = $1 AND user_id = $2 LIMIT 1',
      [batchId, userId]
    );

    if (checkResult.rows.length === 0) {
      const error = new Error('Batch not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Cancel all queued or processing jobs in the batch
    const result = await client.query(`
      UPDATE jobs
      SET status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
      WHERE batch_id = $1
        AND user_id = $2
        AND status IN ('queued', 'processing')
    `, [batchId, userId]);

    logger.info('Batch cancelled', {
      batchId,
      cancelledJobs: result.rowCount,
      userId
    });

    return {
      cancelled_jobs: result.rowCount
    };
  } finally {
    client.release();
  }
}

/**
 * Get batch statistics
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Batch statistics
 */
async function getBatchStatistics(userId) {
  const result = await pool.query(`
    SELECT
      batch_id,
      COUNT(*) as total_jobs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      MIN(created_at) as created_at,
      MAX(completed_at) as last_completed_at
    FROM jobs
    WHERE user_id = $1 AND batch_id IS NOT NULL
    GROUP BY batch_id
    ORDER BY created_at DESC
    LIMIT 50
  `, [userId]);

  return result.rows.map(row => ({
    batch_id: row.batch_id,
    total_jobs: parseInt(row.total_jobs),
    completed: parseInt(row.completed),
    failed: parseInt(row.failed),
    processing: parseInt(row.processing),
    queued: parseInt(row.queued),
    created_at: row.created_at,
    last_completed_at: row.last_completed_at,
    progress: Math.round(
      ((parseInt(row.completed) + parseInt(row.failed)) / parseInt(row.total_jobs)) * 100
    )
  }));
}

/**
 * Create dependent jobs (jobs that run after parent completes)
 * @param {number} parentJobId - Parent job ID
 * @param {number} workflowId - Workflow ID for child jobs
 * @param {number} userId - User ID
 * @param {Array} childJobs - Array of child job specifications
 * @returns {Promise<Object>} Created child jobs
 */
async function createDependentJobs(parentJobId, workflowId, userId, childJobs) {
  const client = await pool.connect();

  try {
    // Verify parent job exists and belongs to user
    const parentResult = await client.query(
      'SELECT id, status FROM jobs WHERE id = $1 AND user_id = $2',
      [parentJobId, userId]
    );

    if (parentResult.rows.length === 0) {
      const error = new Error('Parent job not found');
      error.code = 'PARENT_NOT_FOUND';
      throw error;
    }

    await client.query('BEGIN');

    const createdJobs = [];

    for (const job of childJobs) {
      // Create child job
      const jobResult = await client.query(`
        INSERT INTO jobs (
          workflow_id,
          user_id,
          parameters,
          priority,
          parent_job_id,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'queued')
        RETURNING *
      `, [
        workflowId,
        userId,
        job.parameters,
        job.priority || 0,
        parentJobId
      ]);

      const childJob = jobResult.rows[0];
      createdJobs.push(childJob);

      // Create dependency relationship
      await client.query(`
        INSERT INTO job_dependencies (job_id, depends_on_job_id)
        VALUES ($1, $2)
      `, [childJob.id, parentJobId]);
    }

    await client.query('COMMIT');

    logger.info('Dependent jobs created', {
      parentJobId,
      childJobs: createdJobs.length,
      userId
    });

    return {
      parent_job_id: parentJobId,
      child_jobs: createdJobs
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if job dependencies are satisfied
 * @param {number} jobId - Job ID
 * @returns {Promise<boolean>} True if all dependencies are satisfied
 */
async function areDependenciesSatisfied(jobId) {
  const result = await pool.query(`
    SELECT COUNT(*) as pending_dependencies
    FROM job_dependencies jd
    JOIN jobs j ON jd.depends_on_job_id = j.id
    WHERE jd.job_id = $1
      AND j.status NOT IN ('completed')
  `, [jobId]);

  return parseInt(result.rows[0].pending_dependencies) === 0;
}

/**
 * Get jobs that depend on a completed job
 * @param {number} jobId - Completed job ID
 * @returns {Promise<Array>} List of dependent jobs ready to run
 */
async function getDependentJobsReadyToRun(jobId) {
  const result = await pool.query(`
    SELECT DISTINCT j.*
    FROM jobs j
    JOIN job_dependencies jd ON j.id = jd.job_id
    WHERE jd.depends_on_job_id = $1
      AND j.status = 'queued'
  `, [jobId]);

  const readyJobs = [];

  // Check if each job's dependencies are fully satisfied
  for (const job of result.rows) {
    const satisfied = await areDependenciesSatisfied(job.id);
    if (satisfied) {
      readyJobs.push(job);
    }
  }

  return readyJobs;
}

module.exports = {
  createBatchJobs,
  getBatchStatus,
  cancelBatch,
  getBatchStatistics,
  createDependentJobs,
  areDependenciesSatisfied,
  getDependentJobsReadyToRun
};
