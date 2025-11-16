const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'comfyui',
  user: process.env.DB_USER || 'comfyui',
  password: process.env.DB_PASSWORD,

  // Connection pool configuration
  max: parseInt(process.env.DB_POOL_MAX) || 20, // Maximum number of clients in the pool
  min: parseInt(process.env.DB_POOL_MIN) || 2, // Minimum number of clients in the pool
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // Return error after 10 seconds if connection not established

  // Statement timeout (prevent long-running queries)
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000, // 60 seconds
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

    // Create jobs table (supports both old and new API)
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        job_id UUID UNIQUE DEFAULT gen_random_uuid(),
        user_id INTEGER REFERENCES users(id),
        model VARCHAR(100),
        workflow_id INTEGER REFERENCES workflows(id),
        container_id INTEGER REFERENCES containers(id),
        status VARCHAR(50) NOT NULL DEFAULT 'queued',
        priority INTEGER DEFAULT 0,
        parameters JSONB,
        request_payload JSONB,
        callback_url TEXT,
        input_image_url TEXT,
        output_image_url TEXT,
        result JSONB,
        error JSONB,
        error_message TEXT,
        comfyui_prompt_id VARCHAR(255),
        progress INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
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

    // Create index for job_id lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_job_id
      ON jobs(job_id)
    `);

    // Create API keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key_hash VARCHAR(64) UNIQUE NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        permissions JSONB,
        rate_limit INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP
      )
    `);

    // Create index for API key lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash
      ON api_keys(key_hash)
    `);

    // Create index for user API keys
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_user
      ON api_keys(user_id)
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
