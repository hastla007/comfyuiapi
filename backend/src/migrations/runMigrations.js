const { pool } = require('../database');
const fs = require('fs').promises;
const path = require('path');

async function runMigrations() {
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
  }
}

module.exports = { runMigrations };

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
