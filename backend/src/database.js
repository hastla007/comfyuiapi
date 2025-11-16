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

    // Create api_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key_hash VARCHAR(255) UNIQUE NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        permissions JSONB,
        rate_limit INTEGER DEFAULT 100,
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);

    // Create index on api_keys
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)
    `);

    // Create jobs table (requires pgcrypto extension for gen_random_uuid)
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        job_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
        model VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        request_payload JSONB NOT NULL,
        result JSONB,
        error JSONB,
        callback_url TEXT,
        callback_attempts INTEGER DEFAULT 0,
        callback_last_attempt TIMESTAMP,
        comfyui_prompt_id VARCHAR(255),
        container_id VARCHAR(64) REFERENCES containers(container_id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);

    // Create indexes on jobs table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_model ON jobs(model)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at)
    `);

    // Create model_workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS model_workflows (
        id SERIAL PRIMARY KEY,
        model VARCHAR(100) UNIQUE NOT NULL,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
        is_default BOOLEAN DEFAULT false,
        config JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on model_workflows
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_model_workflows_model ON model_workflows(model)
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
