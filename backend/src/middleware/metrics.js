const client = require('prom-client');
const os = require('os');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const jobsTotal = new client.Counter({
  name: 'jobs_total',
  help: 'Total number of jobs processed',
  labelNames: ['status', 'workflow']
});

const jobDuration = new client.Histogram({
  name: 'job_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['workflow', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600]
});

const activeJobs = new client.Gauge({
  name: 'active_jobs',
  help: 'Number of currently active jobs'
});

const queueLength = new client.Gauge({
  name: 'queue_length',
  help: 'Number of jobs in the queue'
});

const containersTotal = new client.Gauge({
  name: 'containers_total',
  help: 'Total number of containers',
  labelNames: ['status']
});

const databaseConnections = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections'
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(jobsTotal);
register.registerMetric(jobDuration);
register.registerMetric(activeJobs);
register.registerMetric(queueLength);
register.registerMetric(containersTotal);
register.registerMetric(databaseConnections);

// Middleware to track HTTP requests
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestTotal.labels(req.method, route, res.statusCode).inc();
  });

  next();
};

// Detect if running in Docker Desktop environment
const isDockerDesktop = () => {
  try {
    // Check for Docker Desktop indicators
    const hostname = os.hostname();
    // Docker Desktop typically uses specific hostnames or has specific filesystem markers
    if (hostname && hostname.includes('docker-desktop')) {
      return true;
    }

    // Check if running in WSL2 (common for Docker Desktop on Windows)
    try {
      const kernelVersion = execSync('uname -r').toString().toLowerCase();
      if (kernelVersion.includes('microsoft') || kernelVersion.includes('wsl')) {
        return true;
      }
    } catch (e) {
      // Ignore error
    }

    return false;
  } catch (error) {
    return false;
  }
};

// Helper function to get disk usage
const getDiskUsage = () => {
  try {
    // Use df command to get disk usage of root filesystem
    // -BK gives output in kilobytes, which we'll convert to bytes
    const output = execSync('df -BK / | tail -n 1', { timeout: 5000 }).toString();
    const parts = output.split(/\s+/);

    // df output format: Filesystem 1K-blocks Used Available Use% Mounted
    // With -BK flag: parts[1]=total, parts[2]=used, parts[3]=available
    const totalKB = parseInt(parts[1].replace('K', ''));
    const usedKB = parseInt(parts[2].replace('K', ''));
    const availableKB = parseInt(parts[3].replace('K', ''));

    // Validate parsed values
    if (isNaN(totalKB) || isNaN(usedKB) || isNaN(availableKB)) {
      throw new Error('Failed to parse disk usage values');
    }

    const total = totalKB * 1024; // Convert to bytes
    const used = usedKB * 1024;
    const free = availableKB * 1024;
    const usagePercent = total > 0 ? (used / total) * 100 : 0;

    logger.debug('Disk usage retrieved successfully', { total, used, free, usagePercent });

    return {
      total,
      used,
      free,
      usagePercent
    };
  } catch (error) {
    // If df command fails, log warning and return placeholder values
    logger.warn('Failed to get disk usage metrics:', error.message);

    // Return placeholder values to indicate metrics are unavailable
    // This is common in Docker Desktop for Windows/Mac
    return {
      total: -1,  // -1 indicates unavailable
      used: -1,
      free: -1,
      usagePercent: -1
    };
  }
};

// System metrics collection
const getSystemMetrics = () => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    const cpuUsage = totalTick > 0 ? 100 - ~~(100 * totalIdle / totalTick) : 0;

    const diskUsage = getDiskUsage();
    const dockerDesktop = isDockerDesktop();

    // Log if running in Docker Desktop (helps with debugging)
    if (dockerDesktop) {
      logger.debug('Running in Docker Desktop environment - some metrics may be limited');
    }

    return {
      cpu: {
        cores: cpus.length,
        usage: cpuUsage,
        model: cpus[0]?.model || 'Unknown'
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0
      },
      disk: diskUsage,
      system: {
        platform: os.platform(),
        uptime: os.uptime(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        dockerDesktop  // Include Docker Desktop detection status
      }
    };
  } catch (error) {
    logger.error('Error collecting system metrics:', error);

    // Return minimal metrics on error
    return {
      cpu: {
        cores: 0,
        usage: 0,
        model: 'Error'
      },
      memory: {
        total: 0,
        used: 0,
        free: 0,
        usagePercent: 0
      },
      disk: {
        total: -1,
        used: -1,
        free: -1,
        usagePercent: -1
      },
      system: {
        platform: os.platform(),
        uptime: 0,
        nodeVersion: process.version,
        hostname: 'unknown',
        dockerDesktop: false,
        error: error.message
      }
    };
  }
};

module.exports = {
  register,
  metricsMiddleware,
  metrics: {
    httpRequestDuration,
    httpRequestTotal,
    jobsTotal,
    jobDuration,
    activeJobs,
    queueLength,
    containersTotal,
    databaseConnections
  },
  getSystemMetrics
};
