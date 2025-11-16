const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const containerRoutes = require('./routes/containers');
const workflowRoutes = require('./routes/workflows');
const jobRoutes = require('./routes/jobs');
const mediaRoutes = require('./routes/media');
const { initDatabase } = require('./database');
const { testDockerConnection } = require('./docker');
const { scanAndImportWorkflows } = require('./services/workflowScanner');
const jobProcessor = require('./services/jobProcessor');
const scheduler = require('./services/scheduler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Configure CORS for security
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
};
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
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

// Stricter rate limiting for job creation
const jobLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 job creations per minute
  message: 'Too many jobs created, please try again later.',
});

app.use('/api/jobs', jobLimiter);

// Routes
app.use('/api/containers', containerRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/media', mediaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`ComfyUI API Server running on port ${PORT}`);
      console.log(`ComfyUI API Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
