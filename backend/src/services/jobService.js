const { pool } = require('../database');
const { triggerWebhook } = require('./webhookService');

/**
 * Valid model names
 */
const VALID_MODELS = [
  'wan-2.2-text-to-video-turbo',
  'wan-2.2-image-to-video-turbo',
  'wan-2.5-text-to-video',
  'wan-2.5-image-to-video',
  'infinitetalk',
  'infinitetalk-fast',
  'infinitetalk-multi',
  'infinitetalk-fast-multi',
  'infinitetalk-video-to-video',
  'infinitetalk-fast-video-to-video'
];

/**
 * Create a new job
 */
async function createJob(userId, model, requestPayload, workflowId = null, callbackUrl = null) {
  // Validate model name
  if (!VALID_MODELS.includes(model)) {
    throw new Error(`Invalid model name: ${model}. Must be one of: ${VALID_MODELS.join(', ')}`);
  }

  const result = await pool.query(
    `INSERT INTO jobs (user_id, model, request_payload, workflow_id, callback_url, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'queued', NOW() + INTERVAL '48 hours')
     RETURNING job_id, model, status, created_at`,
    [userId, model, requestPayload, workflowId, callbackUrl]
  );

  const job = result.rows[0];

  // Estimate processing time based on model and parameters
  const estimatedTime = estimateProcessingTime(model, requestPayload);

  return {
    success: true,
    job_id: job.job_id,
    status: job.status,
    model: job.model,
    created_at: job.created_at,
    estimated_time: estimatedTime
  };
}

/**
 * Get job by job_id
 */
async function getJob(jobId, userId = null) {
  let query = `
    SELECT
      j.job_id,
      j.model,
      j.status,
      j.progress,
      j.request_payload,
      j.result,
      j.error,
      j.created_at,
      j.started_at,
      j.completed_at,
      j.comfyui_prompt_id,
      w.name as workflow_name
    FROM jobs j
    LEFT JOIN workflows w ON j.workflow_id = w.id
    WHERE j.job_id = $1
  `;

  const params = [jobId];

  if (userId) {
    query += ' AND j.user_id = $2';
    params.push(userId);
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const job = result.rows[0];

  // Format response
  return {
    success: true,
    job_id: job.job_id,
    status: job.status,
    model: job.model,
    progress: job.progress,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    result: job.result,
    error: job.error
  };
}

/**
 * Get job result
 */
async function getJobResult(jobId, userId = null) {
  let query = `
    SELECT job_id, model, status, result, error, completed_at
    FROM jobs
    WHERE job_id = $1
  `;

  const params = [jobId];

  if (userId) {
    query += ' AND user_id = $2';
    params.push(userId);
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const job = result.rows[0];

  if (job.status !== 'completed' && job.status !== 'failed') {
    return {
      success: false,
      error: {
        code: 'job_not_completed',
        message: `Job is ${job.status}, not yet completed`
      }
    };
  }

  if (job.status === 'failed') {
    return {
      success: false,
      job_id: job.job_id,
      status: job.status,
      error: job.error
    };
  }

  return {
    success: true,
    job_id: job.job_id,
    status: job.status,
    result: job.result
  };
}

/**
 * Update job status
 */
async function updateJobStatus(jobId, status, options = {}) {
  const {
    progress = null,
    result = null,
    error = null,
    comfyuiPromptId = null,
    containerId = null
  } = options;

  let updateFields = ['status = $2'];
  let params = [jobId, status];
  let paramIndex = 3;

  if (progress !== null) {
    updateFields.push(`progress = $${paramIndex}`);
    params.push(progress);
    paramIndex++;
  }

  if (result !== null) {
    updateFields.push(`result = $${paramIndex}`);
    params.push(result);
    paramIndex++;
  }

  if (error !== null) {
    updateFields.push(`error = $${paramIndex}`);
    params.push(error);
    paramIndex++;
  }

  if (comfyuiPromptId !== null) {
    updateFields.push(`comfyui_prompt_id = $${paramIndex}`);
    params.push(comfyuiPromptId);
    paramIndex++;
  }

  if (containerId !== null) {
    updateFields.push(`container_id = $${paramIndex}`);
    params.push(containerId);
    paramIndex++;
  }

  // Set timestamps based on status
  if (status === 'processing' && !options.skipStartedAt) {
    updateFields.push('started_at = CURRENT_TIMESTAMP');
  }

  if (status === 'completed' || status === 'failed') {
    updateFields.push('completed_at = CURRENT_TIMESTAMP');
  }

  const query = `
    UPDATE jobs
    SET ${updateFields.join(', ')}
    WHERE job_id = $1
    RETURNING job_id, status, callback_url, model, result, error, completed_at
  `;

  const updateResult = await pool.query(query, params);

  if (updateResult.rows.length === 0) {
    return false;
  }

  const job = updateResult.rows[0];

  // Trigger webhook if job completed or failed and callback_url exists
  if ((status === 'completed' || status === 'failed') && job.callback_url) {
    await triggerWebhook(
      job.callback_url,
      {
        job_id: job.job_id,
        status: job.status,
        model: job.model,
        completed_at: job.completed_at,
        result: job.result,
        error: job.error
      },
      job.job_id
    );
  }

  return true;
}

/**
 * Cancel a job
 */
async function cancelJob(jobId, userId = null) {
  let query = `
    UPDATE jobs
    SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
    WHERE job_id = $1 AND status IN ('queued', 'processing')
  `;

  const params = [jobId];

  if (userId) {
    query += ' AND user_id = $2';
    params.push(userId);
  }

  query += ' RETURNING job_id';

  const result = await pool.query(query, params);

  return result.rows.length > 0;
}

/**
 * List jobs with filters
 */
async function listJobs(userId = null, options = {}) {
  const {
    status = null,
    model = null,
    limit = 50,
    offset = 0
  } = options;

  let query = `
    SELECT
      job_id,
      model,
      status,
      progress,
      created_at,
      started_at,
      completed_at
    FROM jobs
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (userId) {
    query += ` AND user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (model) {
    query += ` AND model = $${paramIndex}`;
    params.push(model);
    paramIndex++;
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_jobs`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Add pagination
  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(Math.min(limit, 100), offset);

  const result = await pool.query(query, params);

  return {
    success: true,
    jobs: result.rows,
    total,
    limit: Math.min(limit, 100),
    offset
  };
}

/**
 * Get next queued job for processing
 * Orders by priority (highest first), then by creation time (oldest first)
 */
async function getNextQueuedJob() {
  const result = await pool.query(
    `UPDATE jobs
     SET status = 'processing', started_at = CURRENT_TIMESTAMP
     WHERE job_id = (
       SELECT job_id
       FROM jobs
       WHERE status = 'queued'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING job_id, model, request_payload, workflow_id, user_id`,
    []
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Clean up expired jobs
 */
async function cleanupExpiredJobs() {
  const result = await pool.query(
    `DELETE FROM jobs
     WHERE status IN ('completed', 'failed')
     AND expires_at < CURRENT_TIMESTAMP
     RETURNING job_id`,
    []
  );

  return result.rows.length;
}

/**
 * Estimate processing time based on model and parameters
 */
function estimateProcessingTime(model, requestPayload) {
  // Base estimates in seconds
  const estimates = {
    'wan-2.2-text-to-video-turbo': 30,
    'wan-2.2-image-to-video-turbo': 25,
    'wan-2.5-text-to-video': 45,
    'wan-2.5-image-to-video': 40,
    'infinitetalk': 20,
    'infinitetalk-fast': 10,
    'infinitetalk-multi': 30,
    'infinitetalk-fast-multi': 15,
    'infinitetalk-video-to-video': 35,
    'infinitetalk-fast-video-to-video': 18
  };

  let baseTime = estimates[model] || 30;

  // Adjust based on resolution
  if (requestPayload.resolution === '1080p') {
    baseTime *= 1.5;
  } else if (requestPayload.resolution === '720p') {
    baseTime *= 1.2;
  }

  // Adjust based on duration
  if (requestPayload.duration) {
    baseTime *= (requestPayload.duration / 5); // Base is 5 seconds
  }

  return Math.round(baseTime);
}

module.exports = {
  createJob,
  getJob,
  getJobResult,
  updateJobStatus,
  cancelJob,
  listJobs,
  getNextQueuedJob,
  cleanupExpiredJobs,
  estimateProcessingTime
};
