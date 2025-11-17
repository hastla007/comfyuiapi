const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { docker } = require('../docker');
const { register, getSystemMetrics } = require('../middleware/metrics');
const { getGpuInfo } = require('../utils/gpuInfo');
const { getContainer } = require('../docker');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { version } = require('../../package.json');

// Main health check endpoint
router.get('/', async (req, res) => {
  try {
    const gpus = await getGpuInfo();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: await checkDatabase(),
      docker: await checkDocker(),
      memory: getMemoryUsage(),
      version,
      gpus,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        uptime: os.uptime()
      }
    };

    // Set overall status based on component health
    if (health.database.status !== 'healthy' || health.docker.status !== 'healthy') {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({ success: true, ...health });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  try {
    const [dbHealth, dockerHealth] = await Promise.all([
      checkDatabase(),
      checkDocker()
    ]);

    const gpus = await getGpuInfo();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      components: {
        database: dbHealth,
        docker: dockerHealth,
        filesystem: await checkFilesystem(),
        memory: getMemoryUsage(),
        cpu: getCPUUsage(),
        gpus
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        uptime: process.uptime()
      }
    });
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Custom metrics endpoint for frontend
router.get('/metrics/custom', async (req, res) => {
  try {
    const metrics = getSystemMetrics();
    const gpus = await getGpuInfo();
    res.json({
      success: true,
      metrics,
      gpus
    });
  } catch (error) {
    logger.error('Custom metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GPU info endpoint for frontend header
router.get('/gpus', async (req, res) => {
  try {
    const gpus = await getGpuInfo();
    res.json({ success: true, gpus });
  } catch (error) {
    logger.error('GPU info endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve GPU info' });
  }
});

// Unload all models from running containers (best-effort)
router.post('/unload-models', async (req, res) => {
  const before = await getGpuInfo();
  const results = [];

  try {
    const running = await pool.query(
      "SELECT id, container_id, name FROM containers WHERE status = 'running'"
    );

    for (const container of running.rows) {
      try {
        const dockerContainer = getContainer(container.container_id);
        const exec = await dockerContainer.exec({
          Cmd: [
            'python3',
            '-c',
            "import comfy.model_management as mm; mm.unload_all_models(); print('unloaded')"
          ],
          AttachStdout: true,
          AttachStderr: true
        });

        const stream = await exec.start({ hijack: true, stdin: false });
        const output = await new Promise(resolve => {
          let buffer = '';
          stream.on('data', data => { buffer += data.toString(); });
          stream.on('end', () => resolve(buffer.trim()));
        });

        results.push({
          containerId: container.container_id,
          name: container.name,
          status: 'ok',
          output
        });
      } catch (error) {
        logger.error(`Unload failed for container ${container.container_id}:`, error);
        results.push({
          containerId: container.container_id,
          name: container.name,
          status: 'error',
          error: error.message
        });
      }
    }
  } catch (error) {
    logger.error('Error unloading models:', error);
    results.push({ status: 'error', error: error.message });
  }

  const after = await getGpuInfo();

  res.json({
    success: true,
    results,
    gpus: {
      before,
      after
    }
  });
});

// Logs endpoint (last N logs) - Public endpoint for read access
router.get('/logs', async (req, res) => {
  try {
    // Validate and bound limit parameter to prevent DoS
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 1000);
    const level = req.query.level;

    const logDir = path.join(__dirname, '../../logs');
    const combinedLogPath = path.join(logDir, 'combined.log');

    let logs = [];

    try {
      const content = await fs.readFile(combinedLogPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Parse JSON logs
      logs = lines
        .slice(-limit * 2) // Get more than needed in case of filtering
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            // If not JSON, create a simple log object
            return {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: line
            };
          }
        })
        .filter(log => !level || log.level === level)
        .slice(-limit);
    } catch (error) {
      logger.warn('Could not read log file:', error.message);
    }

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error) {
    logger.error('Logs endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear logs endpoint (admin only)
router.delete('/logs', requireAdmin, async (req, res) => {
  try {
    const logDir = path.join(__dirname, '../../logs');
    const files = await fs.readdir(logDir);

    for (const file of files) {
      if (file.endsWith('.log')) {
        await fs.writeFile(path.join(logDir, file), '');
      }
    }

    logger.info('Logs cleared by request');
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    logger.error('Clear logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Readiness probe
router.get('/ready', async (req, res) => {
  try {
    const dbReady = await checkDatabase();
    const dockerReady = await checkDocker();

    if (dbReady.status === 'healthy' && dockerReady.status === 'healthy') {
      res.json({ ready: true });
    } else {
      res.status(503).json({ ready: false });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.json({ alive: true, timestamp: new Date().toISOString() });
});

// Helper functions
async function checkDatabase() {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW()');
    const duration = Date.now() - start;

    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };

    return {
      status: 'healthy',
      responseTime: duration,
      connections: poolStats
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkDocker() {
  try {
    const start = Date.now();
    const containers = await docker.listContainers({ all: true });
    const duration = Date.now() - start;

    const runningContainers = containers.filter(c => c.State === 'running').length;

    return {
      status: 'healthy',
      responseTime: duration,
      containers: containers.length,
      running: runningContainers
    };
  } catch (error) {
    logger.error('Docker health check failed:', error);
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkFilesystem() {
  try {
    const mediaDir = process.env.MEDIA_DIR || '/media';
    await fs.access(mediaDir);

    return {
      status: 'healthy',
      mediaDir
    };
  } catch (error) {
    return {
      status: 'degraded',
      error: error.message
    };
  }
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    percentUsed: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2)
  };
}

function getCPUUsage() {
  const cpus = os.cpus();
  return {
    count: cpus.length,
    model: cpus[0].model,
    speed: cpus[0].speed
  };
}

module.exports = router;
