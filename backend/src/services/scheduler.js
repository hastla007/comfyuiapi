const cron = require('node-cron');
const { pool } = require('../database');
const mediaStorage = require('./mediaStorage');
const logger = require('../utils/logger');

/**
 * Scheduled Tasks
 * Handles periodic cleanup and maintenance tasks
 */
class Scheduler {
  constructor() {
    this.tasks = [];
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    // Cleanup old completed/failed jobs daily at 2 AM
    const cleanupJobsTask = cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Running scheduled job cleanup');
        const result = await pool.query(`
          DELETE FROM jobs
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND completed_at < NOW() - INTERVAL '7 days'
        `);
        logger.info(`Cleaned up ${result.rowCount} old jobs`);
      } catch (error) {
        logger.error('Error in scheduled job cleanup:', error);
      }
    });

    this.tasks.push({ name: 'cleanup-jobs', task: cleanupJobsTask });

    // Cleanup old media files daily at 3 AM
    const cleanupMediaTask = cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('Running scheduled media cleanup');
        const deletedCount = await mediaStorage.cleanupOldImages(7);
        logger.info(`Cleaned up ${deletedCount} old media files`);
      } catch (error) {
        logger.error('Error in scheduled media cleanup:', error);
      }
    });

    this.tasks.push({ name: 'cleanup-media', task: cleanupMediaTask });

    // Check for stuck jobs every 30 minutes
    const checkStuckJobsTask = cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('Checking for stuck jobs');

        // Mark jobs as failed if they've been processing for more than 1 hour
        const result = await pool.query(`
          UPDATE jobs
          SET status = 'failed',
              error_message = 'Job timed out after 1 hour',
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE status = 'processing'
            AND started_at < NOW() - INTERVAL '1 hour'
        `);

        if (result.rowCount > 0) {
          logger.warn(`Marked ${result.rowCount} stuck jobs as failed`);
        }
      } catch (error) {
        logger.error('Error checking for stuck jobs:', error);
      }
    });

    this.tasks.push({ name: 'check-stuck-jobs', task: checkStuckJobsTask });

    // Log storage stats daily at 1 AM
    const logStatsTask = cron.schedule('0 1 * * *', async () => {
      try {
        const stats = await mediaStorage.getStats();
        logger.info('Storage stats:', stats);

        const jobStats = await pool.query(`
          SELECT status, COUNT(*) as count
          FROM jobs
          GROUP BY status
        `);
        logger.info('Job stats:', jobStats.rows);
      } catch (error) {
        logger.error('Error logging stats:', error);
      }
    });

    this.tasks.push({ name: 'log-stats', task: logStatsTask });

    logger.info(`Started ${this.tasks.length} scheduled tasks`);
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    this.tasks.forEach(({ name, task }) => {
      task.stop();
      logger.info(`Stopped scheduled task: ${name}`);
    });
    this.tasks = [];
  }

  /**
   * Get list of scheduled tasks
   */
  getTasks() {
    return this.tasks.map(({ name }) => name);
  }
}

// Singleton instance
const scheduler = new Scheduler();

module.exports = scheduler;
