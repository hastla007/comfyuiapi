const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const containerRoutes = require('./routes/containers');
const workflowRoutes = require('./routes/workflows');
const { initDatabase } = require('./database');
const { testDockerConnection } = require('./docker');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:8080';
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
    console.log('Starting ComfyUI API Server...');

    // Test Docker connection
    const dockerConnected = await testDockerConnection();
    if (!dockerConnected) {
      console.error('Docker connection failed. Exiting...');
      process.exit(1);
    }

    // Initialize database
    await initDatabase();

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ ComfyUI API Server running on port ${PORT}`);
      console.log(`✓ CORS enabled for: ${corsOrigin}`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

start();
