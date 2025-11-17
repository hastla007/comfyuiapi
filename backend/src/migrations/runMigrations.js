const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

async function runMigrations(providedPool) {
  const pool = providedPool || new Pool({
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'comfyui',
    user: process.env.DB_USER || 'comfyui',
    password: process.env.DB_PASSWORD,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 10000,
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 60000
  });

  const client = await pool.connect();
  try {
    console.log('Running database migrations...');

    const migrationFiles = [
      'comprehensive-features.sql',
      'add-container-load-tracking.sql'
    ];

    for (const file of migrationFiles) {
      const migrationPath = path.join(__dirname, file);
      const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
      await client.query(migrationSQL);
    }

    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    if (!providedPool) {
      await pool.end();
    }
  }
}

module.exports = { runMigrations };

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
