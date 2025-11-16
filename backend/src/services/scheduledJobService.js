const cron = require('node-cron');
const schedule = require('node-schedule');
const { pool } = require('../database');
const logger = require('../utils/logger');

/**
 * Scheduled Job Service
 * Handles cron-based job scheduling and execution
 */

// Store active scheduled jobs
const activeSchedules = new Map();

/**
 * Create a scheduled job
 * @param {number} userId - User ID
 * @param {number} workflowId - Workflow ID
 * @param {string} name - Schedule name
 * @param {string} cronExpression - Cron expression
 * @param {Object} parameters - Job parameters
 * @param {boolean} isActive - Whether schedule is active
 * @returns {Promise<Object>} Created scheduled job
 */
async function createScheduledJob(userId, workflowId, name, cronExpression, parameters, isActive = true) {
  const client = await pool.connect();

  try {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      const error = new Error('Invalid cron expression');
      error.code = 'INVALID_CRON';
      throw error;
    }

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

    // Calculate next run time
    const nextRunAt = getNextRunTime(cronExpression);

    const result = await client.query(`
      INSERT INTO scheduled_jobs (
        user_id, workflow_id, name, cron_expression,
        parameters, is_active, next_run_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [userId, workflowId, name, cronExpression, parameters, isActive, nextRunAt]);

    const scheduledJob = result.rows[0];

    // Start the schedule if active
    if (isActive) {
      startSchedule(scheduledJob);
    }

    logger.info('Scheduled job created', {
      scheduledJobId: scheduledJob.id,
      userId,
      cronExpression
    });

    return scheduledJob;
  } finally {
    client.release();
  }
}

/**
 * List scheduled jobs for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of scheduled jobs
 */
async function listScheduledJobs(userId) {
  const result = await pool.query(`
    SELECT sj.*, w.name as workflow_name
    FROM scheduled_jobs sj
    LEFT JOIN workflows w ON sj.workflow_id = w.id
    WHERE sj.user_id = $1
    ORDER BY sj.created_at DESC
  `, [userId]);

  return result.rows;
}

/**
 * Get scheduled job by ID
 * @param {number} id - Scheduled job ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Scheduled job
 */
async function getScheduledJobById(id, userId) {
  const result = await pool.query(`
    SELECT sj.*, w.name as workflow_name, w.workflow_json
    FROM scheduled_jobs sj
    LEFT JOIN workflows w ON sj.workflow_id = w.id
    WHERE sj.id = $1 AND sj.user_id = $2
  `, [id, userId]);

  return result.rows[0] || null;
}

/**
 * Update scheduled job
 * @param {number} id - Scheduled job ID
 * @param {number} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated scheduled job
 */
async function updateScheduledJob(id, userId, updateData) {
  const client = await pool.connect();

  try {
    // Get existing job
    const existing = await client.query(
      'SELECT * FROM scheduled_jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      const error = new Error('Scheduled job not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const oldJob = existing.rows[0];

    // Validate cron expression if being updated
    if (updateData.cron_expression && !cron.validate(updateData.cron_expression)) {
      const error = new Error('Invalid cron expression');
      error.code = 'INVALID_CRON';
      throw error;
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['name', 'cron_expression', 'parameters', 'is_active'];

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return oldJob;
    }

    // If cron expression changed, calculate new next run time
    if (updateData.cron_expression) {
      const nextRunAt = getNextRunTime(updateData.cron_expression);
      updates.push(`next_run_at = $${paramIndex}`);
      values.push(nextRunAt);
      paramIndex++;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const query = `
      UPDATE scheduled_jobs
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await client.query(query, values);
    const updatedJob = result.rows[0];

    // Stop old schedule
    stopSchedule(id);

    // Start new schedule if active
    if (updatedJob.is_active) {
      startSchedule(updatedJob);
    }

    logger.info('Scheduled job updated', {
      scheduledJobId: id,
      userId
    });

    return updatedJob;
  } finally {
    client.release();
  }
}

/**
 * Delete scheduled job
 * @param {number} id - Scheduled job ID
 * @param {number} userId - User ID
 */
async function deleteScheduledJob(id, userId) {
  const result = await pool.query(
    'DELETE FROM scheduled_jobs WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (result.rowCount === 0) {
    const error = new Error('Scheduled job not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Stop the schedule
  stopSchedule(id);

  logger.info('Scheduled job deleted', {
    scheduledJobId: id,
    userId
  });
}

/**
 * Start a schedule
 * @param {Object} scheduledJob - Scheduled job object
 */
function startSchedule(scheduledJob) {
  // Stop existing schedule if any
  stopSchedule(scheduledJob.id);

  try {
    // Create scheduled task
    const task = schedule.scheduleJob(scheduledJob.cron_expression, async () => {
      await executeScheduledJob(scheduledJob.id);
    });

    activeSchedules.set(scheduledJob.id, task);

    logger.info('Schedule started', {
      scheduledJobId: scheduledJob.id,
      cronExpression: scheduledJob.cron_expression
    });
  } catch (error) {
    logger.error('Error starting schedule:', error);
  }
}

/**
 * Stop a schedule
 * @param {number} scheduledJobId - Scheduled job ID
 */
function stopSchedule(scheduledJobId) {
  const task = activeSchedules.get(scheduledJobId);
  if (task) {
    task.cancel();
    activeSchedules.delete(scheduledJobId);

    logger.info('Schedule stopped', { scheduledJobId });
  }
}

/**
 * Execute a scheduled job
 * @param {number} scheduledJobId - Scheduled job ID
 */
async function executeScheduledJob(scheduledJobId) {
  const client = await pool.connect();

  try {
    // Get scheduled job
    const result = await client.query(
      'SELECT * FROM scheduled_jobs WHERE id = $1 AND is_active = true',
      [scheduledJobId]
    );

    if (result.rows.length === 0) {
      logger.warn('Scheduled job not found or inactive', { scheduledJobId });
      stopSchedule(scheduledJobId);
      return;
    }

    const scheduledJob = result.rows[0];

    // Create new job
    const jobResult = await client.query(`
      INSERT INTO jobs (
        workflow_id,
        user_id,
        parameters,
        status,
        priority
      )
      VALUES ($1, $2, $3, 'queued', 5)
      RETURNING *
    `, [
      scheduledJob.workflow_id,
      scheduledJob.user_id,
      scheduledJob.parameters
    ]);

    const job = jobResult.rows[0];

    // Update last run time and calculate next run time
    const nextRunAt = getNextRunTime(scheduledJob.cron_expression);
    await client.query(`
      UPDATE scheduled_jobs
      SET last_run_at = CURRENT_TIMESTAMP,
          next_run_at = $1
      WHERE id = $2
    `, [nextRunAt, scheduledJobId]);

    logger.info('Scheduled job executed', {
      scheduledJobId,
      jobId: job.id,
      nextRunAt
    });
  } catch (error) {
    logger.error('Error executing scheduled job:', error);
  } finally {
    client.release();
  }
}

/**
 * Calculate next run time for cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {Date} Next run time
 */
function getNextRunTime(cronExpression) {
  try {
    // Create a temporary job to get next invocation
    const tempJob = schedule.scheduleJob(cronExpression, () => {});
    const nextInvocation = tempJob.nextInvocation();
    tempJob.cancel();

    return nextInvocation;
  } catch (error) {
    logger.error('Error calculating next run time:', error);
    return null;
  }
}

/**
 * Initialize scheduled jobs on startup
 * Load all active scheduled jobs from database and start them
 */
async function initializeScheduledJobs() {
  try {
    const result = await pool.query(
      'SELECT * FROM scheduled_jobs WHERE is_active = true'
    );

    for (const scheduledJob of result.rows) {
      startSchedule(scheduledJob);
    }

    logger.info('Scheduled jobs initialized', { count: result.rows.length });
  } catch (error) {
    logger.error('Error initializing scheduled jobs:', error);
  }
}

/**
 * Shutdown all scheduled jobs
 */
function shutdownScheduledJobs() {
  activeSchedules.forEach((task, scheduledJobId) => {
    stopSchedule(scheduledJobId);
  });

  logger.info('All scheduled jobs stopped');
}

/**
 * Get active schedules count
 * @returns {number} Number of active schedules
 */
function getActiveSchedulesCount() {
  return activeSchedules.size;
}

module.exports = {
  createScheduledJob,
  listScheduledJobs,
  getScheduledJobById,
  updateScheduledJob,
  deleteScheduledJob,
  executeScheduledJob,
  initializeScheduledJobs,
  shutdownScheduledJobs,
  getActiveSchedulesCount
};
