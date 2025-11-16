const client = require('prom-client');
const os = require('os');

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

// System metrics collection
const getSystemMetrics = () => {
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
  const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

  return {
    cpu: {
      cores: cpus.length,
      usage: cpuUsage
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usagePercent: (usedMem / totalMem) * 100
    },
    disk: {
      // Note: Getting accurate disk usage in Node.js requires external libraries
      // This is a placeholder - in production, consider using 'diskusage' package
      total: 0,
      used: 0,
      free: 0,
      usagePercent: 0
    },
    system: {
      platform: os.platform(),
      uptime: os.uptime(),
      nodeVersion: process.version
    }
  };
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
