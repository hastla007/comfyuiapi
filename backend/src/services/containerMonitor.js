const { pool } = require('../database');
const { getContainer } = require('../docker');
const websocketService = require('./websocketService');
const logger = require('../utils/logger');

/**
 * Container Monitor Service
 * Monitors container status and broadcasts updates via WebSocket
 */
class ContainerMonitor {
  constructor() {
    this.isRunning = false;
    this.monitorInterval = 5000; // Monitor every 5 seconds
    this.containerStates = new Map(); // containerId -> last known state
  }

  /**
   * Start the container monitor
   */
  start() {
    if (this.isRunning) {
      logger.info('Container monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Container monitor started');
    this.monitorLoop();
  }

  /**
   * Stop the container monitor
   */
  stop() {
    this.isRunning = false;
    logger.info('Container monitor stopped');
  }

  /**
   * Main monitoring loop
   */
  async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.checkAllContainers();
      } catch (error) {
        logger.error('Error in container monitoring loop:', error);
      }

      // Wait before next check
      await this.sleep(this.monitorInterval);
    }
  }

  /**
   * Check all containers and broadcast status updates
   */
  async checkAllContainers() {
    try {
      // Get all containers from database
      const result = await pool.query('SELECT * FROM containers');
      const containers = result.rows;

      for (const container of containers) {
        await this.checkContainer(container);
      }
    } catch (error) {
      logger.error('Error checking containers:', error);
    }
  }

  /**
   * Check individual container status
   */
  async checkContainer(dbContainer) {
    try {
      const dockerContainer = getContainer(dbContainer.container_id);
      const inspect = await dockerContainer.inspect();

      const currentState = {
        status: inspect.State.Running ? 'running' : 'stopped',
        health: inspect.State.Health?.Status || 'unknown',
        startedAt: inspect.State.StartedAt,
        finishedAt: inspect.State.FinishedAt,
        exitCode: inspect.State.ExitCode,
        pid: inspect.State.Pid
      };

      // Get container stats if running
      let stats = null;
      if (inspect.State.Running) {
        try {
          const statsStream = await dockerContainer.stats({ stream: false });
          stats = this.parseStats(statsStream);
        } catch (error) {
          logger.debug(`Failed to get stats for container ${dbContainer.id}:`, error.message);
        }
      }

      // Check if state has changed
      const lastState = this.containerStates.get(dbContainer.id);
      const hasChanged = !lastState || JSON.stringify(lastState) !== JSON.stringify(currentState);

      if (hasChanged) {
        // Update database if status changed
        if (!lastState || lastState.status !== currentState.status) {
          await pool.query(
            'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [currentState.status, dbContainer.id]
          );
        }

        // Broadcast update
        websocketService.broadcastContainerStatus(dbContainer.id, {
          status: currentState.status,
          name: dbContainer.name,
          state: currentState,
          stats: stats,
          port: dbContainer.port
        });

        // Update cached state
        this.containerStates.set(dbContainer.id, currentState);

        logger.debug(`Container ${dbContainer.name} status: ${currentState.status}`);
      }
    } catch (error) {
      // Container might have been removed
      if (error.statusCode === 404) {
        logger.warn(`Container ${dbContainer.id} not found in Docker`);

        // Update database
        await pool.query(
          'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['stopped', dbContainer.id]
        );

        // Broadcast update
        websocketService.broadcastContainerStatus(dbContainer.id, {
          status: 'stopped',
          name: dbContainer.name,
          state: { status: 'stopped' }
        });
      } else {
        logger.error(`Error checking container ${dbContainer.id}:`, error);
      }
    }
  }

  /**
   * Parse Docker stats
   */
  parseStats(stats) {
    if (!stats) return null;

    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

    // Calculate memory usage
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 0;
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    // Calculate network I/O
    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      Object.values(stats.networks).forEach(net => {
        networkRx += net.rx_bytes || 0;
        networkTx += net.tx_bytes || 0;
      });
    }

    // Calculate block I/O
    let blockRead = 0;
    let blockWrite = 0;
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      stats.blkio_stats.io_service_bytes_recursive.forEach(io => {
        if (io.op === 'read') blockRead += io.value;
        if (io.op === 'write') blockWrite += io.value;
      });
    }

    return {
      cpu: {
        percent: parseFloat(cpuPercent.toFixed(2)),
        cores: stats.cpu_stats.online_cpus
      },
      memory: {
        usage: memoryUsage,
        limit: memoryLimit,
        percent: parseFloat(memoryPercent.toFixed(2)),
        usageMB: parseFloat((memoryUsage / 1024 / 1024).toFixed(2)),
        limitMB: parseFloat((memoryLimit / 1024 / 1024).toFixed(2))
      },
      network: {
        rx: networkRx,
        tx: networkTx,
        rxMB: parseFloat((networkRx / 1024 / 1024).toFixed(2)),
        txMB: parseFloat((networkTx / 1024 / 1024).toFixed(2))
      },
      blockIO: {
        read: blockRead,
        write: blockWrite,
        readMB: parseFloat((blockRead / 1024 / 1024).toFixed(2)),
        writeMB: parseFloat((blockWrite / 1024 / 1024).toFixed(2))
      }
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      monitoredContainers: this.containerStates.size,
      monitorInterval: this.monitorInterval
    };
  }
}

// Export singleton instance
module.exports = new ContainerMonitor();
