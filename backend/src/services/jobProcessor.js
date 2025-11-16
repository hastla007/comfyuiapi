const { pool } = require('../database');
const { createClient } = require('./comfyuiClient');
const { triggerWebhook } = require('./webhookService');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Job Processor
 * Processes jobs from the queue and executes them on ComfyUI containers
 */
class JobProcessor {
  constructor() {
    this.isRunning = false;
    this.processingJobs = new Map(); // jobId -> { client, promptId }
    this.pollInterval = 2000; // Poll every 2 seconds
    this.maxConcurrentJobs = 10; // Max concurrent jobs
  }

  /**
   * Start the job processor
   */
  start() {
    if (this.isRunning) {
      logger.info('Job processor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Job processor started');
    this.processLoop();
  }

  /**
   * Stop the job processor
   */
  stop() {
    this.isRunning = false;
    logger.info('Job processor stopped');
  }

  /**
   * Main processing loop
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        await this.processNextJob();
      } catch (error) {
        logger.error('Error in job processing loop:', error);
      }

      // Wait before next poll
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Process the next job in the queue
   */
  async processNextJob() {
    // Check if we've hit max concurrent jobs
    if (this.processingJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    // Get the next queued job
    const job = await this.getNextQueuedJob();

    if (!job) {
      return; // No jobs to process
    }

    // Process the job (don't await - let it run in background)
    this.executeJob(job).catch(error => {
      logger.error(`Error executing job ${job.id}:`, error);
      this.handleJobError(job.id, error.message);
    });
  }

  /**
   * Get the next queued job from the database
   */
  async getNextQueuedJob() {
    const client = await pool.connect();
    try {
      // Get next job with highest priority, oldest first
      const result = await client.query(`
        UPDATE jobs
        SET status = 'processing',
            started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = (
          SELECT id FROM jobs
          WHERE status = 'queued'
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a job
   */
  async executeJob(job) {
    logger.info(`Executing job ${job.id} (workflow: ${job.workflow_id})`);

    try {
      // Get workflow
      const workflow = await this.getWorkflow(job.workflow_id);

      if (!workflow) {
        throw new Error(`Workflow ${job.workflow_id} not found`);
      }

      // Select a container
      const container = await this.selectContainer(job.container_id);

      if (!container) {
        throw new Error('No available containers');
      }

      // Create ComfyUI client
      const client = createClient(container.port);

      // Connect WebSocket for progress updates
      await client.connectWebSocket();

      // Set up event listeners
      this.setupClientListeners(client, job.id);

      // Queue the prompt
      const promptId = await client.queuePrompt(
        workflow.workflow_json.workflow || workflow.workflow_json,
        job.parameters
      );

      logger.info(`Job ${job.id} queued as prompt ${promptId}`);

      // Update job with ComfyUI prompt ID
      await this.updateJob(job.id, {
        comfyui_prompt_id: promptId
      });

      // Store processing info
      this.processingJobs.set(job.id, { client, promptId, containerId: container.id });

      // Wait for completion
      await this.waitForCompletion(client, promptId, job.id);

      // Get output images
      const images = await client.getOutputImages(promptId);

      if (images.length === 0) {
        throw new Error('No output images generated');
      }

      // Save the first output image
      const outputUrl = images[0].url;

      // Mark job as completed
      await this.completeJob(job.id, outputUrl);

      logger.info(`Job ${job.id} completed successfully`);

      // Cleanup
      client.disconnect();
      this.processingJobs.delete(job.id);

    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);
      await this.handleJobError(job.id, error.message);

      // Cleanup
      const processingInfo = this.processingJobs.get(job.id);
      if (processingInfo) {
        processingInfo.client.disconnect();
        this.processingJobs.delete(job.id);
      }
    }
  }

  /**
   * Set up event listeners for ComfyUI client
   */
  setupClientListeners(client, jobId) {
    client.on('progress', async (data) => {
      if (data.percentage !== undefined) {
        await this.updateJob(jobId, { progress: data.percentage });
      }
    });

    client.on('execution_error', async (data) => {
      logger.error(`Execution error for job ${jobId}:`, data.error);
      await this.handleJobError(jobId, data.error);
    });
  }

  /**
   * Wait for prompt completion
   */
  async waitForCompletion(client, promptId, jobId, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Job execution timeout'));
      }, timeout);

      const completionHandler = (data) => {
        if (data.promptId === promptId) {
          clearTimeout(timeoutId);
          client.removeListener('execution_complete', completionHandler);
          client.removeListener('execution_error', errorHandler);
          resolve();
        }
      };

      const errorHandler = (data) => {
        if (data.promptId === promptId) {
          clearTimeout(timeoutId);
          client.removeListener('execution_complete', completionHandler);
          client.removeListener('execution_error', errorHandler);
          reject(new Error(data.error || 'Execution failed'));
        }
      };

      client.on('execution_complete', completionHandler);
      client.on('execution_error', errorHandler);
    });
  }

  /**
   * Get workflow from database
   */
  async getWorkflow(workflowId) {
    const result = await pool.query(
      'SELECT * FROM workflows WHERE id = $1',
      [workflowId]
    );
    return result.rows[0] || null;
  }

  /**
   * Select an available container
   */
  async selectContainer(preferredContainerId = null) {
    // If a specific container is requested, use it
    if (preferredContainerId) {
      const result = await pool.query(
        'SELECT * FROM containers WHERE id = $1 AND status = $2',
        [preferredContainerId, 'running']
      );
      return result.rows[0] || null;
    }

    // Otherwise, find any running container
    const result = await pool.query(
      `SELECT * FROM containers
       WHERE status = 'running'
       ORDER BY id ASC
       LIMIT 1`
    );

    return result.rows[0] || null;
  }

  /**
   * Update job in database
   */
  async updateJob(jobId, updates) {
    // Whitelist of allowed fields to prevent SQL injection
    const allowedFields = [
      'status', 'progress', 'error_message', 'output_image_url',
      'comfyui_prompt_id', 'started_at', 'completed_at',
      'input_image_url', 'container_id', 'parameters'
    ];

    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      // Only allow whitelisted fields
      if (!allowedFields.includes(key)) {
        throw new Error(`Invalid field name: ${key}`);
      }
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (fields.length === 0) {
      // No valid fields to update
      return;
    }

    // Always update updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(jobId);

    const query = `
      UPDATE jobs
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
    `;

    await pool.query(query, values);
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, outputUrl) {
    const result = await pool.query(`
      UPDATE jobs
      SET status = 'completed',
          output_image_url = $1,
          progress = 100,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING job_id, callback_url, model, request_payload
    `, [outputUrl, jobId]);

    // Trigger webhook if callback_url exists
    if (result.rows.length > 0 && result.rows[0].callback_url) {
      const job = result.rows[0];
      await triggerWebhook(
        job.callback_url,
        {
          job_id: job.job_id,
          status: 'completed',
          model: job.model,
          result: { output_url: outputUrl },
          completed_at: new Date().toISOString()
        },
        job.job_id
      ).catch(err => {
        logger.error(`Failed to trigger webhook for job ${job.job_id}:`, err);
      });
    }
  }

  /**
   * Handle job error
   */
  async handleJobError(jobId, errorMessage) {
    const result = await pool.query(`
      UPDATE jobs
      SET status = 'failed',
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING job_id, callback_url, model, request_payload
    `, [errorMessage, jobId]);

    // Trigger webhook if callback_url exists
    if (result.rows.length > 0 && result.rows[0].callback_url) {
      const job = result.rows[0];
      await triggerWebhook(
        job.callback_url,
        {
          job_id: job.job_id,
          status: 'failed',
          model: job.model,
          error: { message: errorMessage },
          completed_at: new Date().toISOString()
        },
        job.job_id
      ).catch(err => {
        logger.error(`Failed to trigger webhook for job ${job.job_id}:`, err);
      });
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    const processingInfo = this.processingJobs.get(jobId);

    // Update job status ONLY if it's still in a cancellable state
    // This prevents race conditions where job completes while cancellation is in progress
    const result = await pool.query(`
      UPDATE jobs
      SET status = 'cancelled',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('queued', 'processing')
      RETURNING id
    `, [jobId]);

    // If the update affected no rows, the job was already in a final state
    if (result.rows.length === 0) {
      logger.info(`Cannot cancel job ${jobId} - already in final state`);
      return false;
    }

    // Only cancel in ComfyUI if it's currently being processed
    if (processingInfo) {
      try {
        // Cancel the prompt in ComfyUI
        await processingInfo.client.cancelPrompt(processingInfo.promptId);
        processingInfo.client.disconnect();
      } catch (error) {
        logger.error(`Error cancelling ComfyUI prompt for job ${jobId}:`, error);
      } finally {
        this.processingJobs.delete(jobId);
      }
    }

    return true;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all jobs (with pagination)
   */
  async getJobs(limit = 50, offset = 0, status = null) {
    let query = 'SELECT * FROM jobs';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processing stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.processingJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs
    };
  }
}

// Singleton instance
const jobProcessor = new JobProcessor();

module.exports = jobProcessor;
