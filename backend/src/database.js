const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'comfyui',
  user: process.env.DB_USER || 'comfyui',
  password: process.env.DB_PASSWORD || 'comfyui_password',
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
  // Don't exit the process, just log the error
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        credits INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create containers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS containers (
        id SERIAL PRIMARY KEY,
        container_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) UNIQUE NOT NULL,
        port INTEGER UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL,
        workflow_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        workflow_json JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER REFERENCES workflows(id),
        container_id INTEGER REFERENCES containers(id),
        status VARCHAR(50) NOT NULL DEFAULT 'queued',
        priority INTEGER DEFAULT 0,
        parameters JSONB NOT NULL,
        input_image_url TEXT,
        output_image_url TEXT,
        comfyui_prompt_id VARCHAR(255),
        error_message TEXT,
        progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'))
      )
    `);

    // Create index for faster job queue queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_status_priority
      ON jobs(status, priority DESC, created_at ASC)
    `);

    // Create index for job lookup by comfyui_prompt_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_comfyui_prompt_id
      ON jobs(comfyui_prompt_id)
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
