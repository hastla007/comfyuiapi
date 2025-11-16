const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const containerRoutes = require('./routes/containers');
const workflowRoutes = require('./routes/workflows');
const jobRoutes = require('./routes/jobs');
const mediaRoutes = require('./routes/media');
const healthRoutes = require('./routes/health');
const settingsRoutes = require('./routes/settings');
const infinitetalkRoutes = require('./routes/infinitetalk');
const wanRoutes = require('./routes/wan');
const apiKeysRoutes = require('./routes/apiKeys');
const usersRoutes = require('./routes/users');
const logsRoutes = require('./routes/logs');
const authRoutes = require('./routes/auth');
const organizationsRoutes = require('./routes/organizations');
const marketplaceRoutes = require('./routes/marketplace');
const advancedJobsRoutes = require('./routes/advancedJobs');
const containerPoolsRoutes = require('./routes/containerPools');
const storageRoutes = require('./routes/storage');
const gpuRoutes = require('./routes/gpu');
const notificationsRoutes = require('./routes/notifications');
const { initDatabase } = require('./database');
const { testDockerConnection, ensureNetwork } = require('./docker');
const { scanAndImportWorkflows } = require('./services/workflowScanner');
const jobProcessor = require('./services/jobProcessor');
const scheduler = require('./services/scheduler');
const websocketService = require('./services/websocketService');
const containerMonitor = require('./services/containerMonitor');
const autoScaler = require('./services/autoScaler');
const scheduledJobService = require('./services/scheduledJobService');
const logger = require('./utils/logger');
const { metricsMiddleware } = require('./middleware/metrics');
const swaggerSpec = require('./config/swagger');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Middleware
// Configure CORS for security
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
};
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Stricter rate limiting for job creation only (not GET requests)
const jobLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 job creations per minute
  message: 'Too many jobs created, please try again later.',
  skip: (req) => req.method === 'GET' // Skip rate limiting for GET requests (status checks)
});

app.use('/api/jobs', jobLimiter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ComfyUI API Documentation'
}));

// Health and monitoring routes
app.use('/api/health', healthRoutes);

// API Routes
app.use('/api/containers', containerRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);

// Model API Routes
app.use('/api/v1/infinitetalk', infinitetalkRoutes);
app.use('/api/v1/wan', wanRoutes);

// Authentication & User Management
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Marketplace Routes
app.use('/api/marketplace', marketplaceRoutes);

// Advanced Job Management
app.use('/api/advanced-jobs', advancedJobsRoutes);

// Container Pools & Auto-Scaling
app.use('/api/container-pools', containerPoolsRoutes);

// Storage Management
app.use('/api/storage', storageRoutes);

// GPU Management
app.use('/api/gpu', gpuRoutes);

// Admin API Routes
app.use('/api/admin/api-keys', apiKeysRoutes);
app.use('/api/admin/users', usersRoutes);

// Legacy health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'not_found',
      message: `Cannot ${req.method} ${req.path}`,
      requestId: req.id
    }
  });
});

// Centralized error handling middleware - must be last
app.use((err, req, res, next) => {
  // Log the error with request context
  logger.error('Unhandled error:', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'internal_error',
      message: isDevelopment ? err.message : 'An unexpected error occurred',
      ...(isDevelopment && { stack: err.stack }),
      requestId: req.id
    }
  });
});

// Initialize database and start server
async function start() {
  try {
    // Test Docker connection
    const dockerConnected = await testDockerConnection();
    if (!dockerConnected) {
      console.error('Docker connection failed. Exiting...');
      process.exit(1);
    }

    // Ensure Docker network exists
    await ensureNetwork();

    // Initialize database with retry logic
    let retries = 5;
    let connected = false;
    while (retries > 0 && !connected) {
      try {
        await initDatabase();
        connected = true;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Database connection failed. Retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Scan and import workflows from filesystem
    await scanAndImportWorkflows();

    // Start job processor
    jobProcessor.start();
    logger.info('Job processor started');

    // Start scheduled tasks
    scheduler.start();
    logger.info('Scheduler started');

    // Initialize WebSocket server
    websocketService.initialize(server, corsOptions);
    logger.info('WebSocket server initialized');

    // Start container monitor
    containerMonitor.start();
    logger.info('Container monitor started');

    // Start auto-scaler
    autoScaler.start();
    logger.info('Auto-scaler started');

    // Start scheduled job service
    scheduledJobService.start();
    logger.info('Scheduled job service started');

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`ComfyUI API Server running on port ${PORT}`);
      console.log(`ComfyUI API Server running on port ${PORT}`);
      console.log(`WebSocket server ready at ws://localhost:${PORT}/socket.io`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
