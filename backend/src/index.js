const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const containerRoutes = require('./routes/containers');
const workflowRoutes = require('./routes/workflows');
const { initDatabase } = require('./database');
const { testDockerConnection } = require('./docker');
const { scanAndImportWorkflows } = require('./services/workflowScanner');

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

// Routes
app.use('/api/containers', containerRoutes);
app.use('/api/workflows', workflowRoutes);

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

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ComfyUI API Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
