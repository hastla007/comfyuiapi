const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../database');

/**
 * Scans the workflows folder for JSON files and imports them into the database
 */
async function scanAndImportWorkflows() {
  const workflowsDir = process.env.WORKFLOWS_DIR || '/app/workflows';

  try {
    console.log(`Scanning workflows directory: ${workflowsDir}`);

    // Check if directory exists
    try {
      await fs.access(workflowsDir);
    } catch (error) {
      console.log(`Workflows directory does not exist: ${workflowsDir}`);
      return;
    }

    // Read all files in the workflows directory
    const files = await fs.readdir(workflowsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('No workflow JSON files found in workflows directory');
      return;
    }

    console.log(`Found ${jsonFiles.length} workflow file(s)`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(workflowsDir, file);

      try {
        // Read and parse the workflow file
        const content = await fs.readFile(filePath, 'utf-8');
        const workflowJson = JSON.parse(content);

        // Use filename (without extension) as default name
        const defaultName = path.basename(file, '.json');

        // Extract name from JSON if it has a name field, otherwise use filename
        const workflowName = workflowJson.name || defaultName;
        const workflowDescription = workflowJson.description || `Imported from ${file}`;

        // Check if workflow with this name already exists
        const existing = await pool.query(
          'SELECT id FROM workflows WHERE name = $1',
          [workflowName]
        );

        if (existing.rows.length > 0) {
          // Update existing workflow
          await pool.query(
            'UPDATE workflows SET workflow_json = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE name = $3',
            [workflowJson, workflowDescription, workflowName]
          );
          console.log(`  ✓ Updated workflow: ${workflowName}`);
          updated++;
        } else {
          // Insert new workflow
          await pool.query(
            'INSERT INTO workflows (name, description, workflow_json) VALUES ($1, $2, $3)',
            [workflowName, workflowDescription, workflowJson]
          );
          console.log(`  ✓ Imported workflow: ${workflowName}`);
          imported++;
        }
      } catch (error) {
        console.error(`  ✗ Error processing ${file}:`, error.message);
        skipped++;
      }
    }

    console.log(`Workflow import summary: ${imported} imported, ${updated} updated, ${skipped} skipped`);
  } catch (error) {
    console.error('Error scanning workflows directory:', error);
  }
}

/**
 * Watch workflows directory for changes (optional feature)
 */
async function watchWorkflowsDirectory() {
  const workflowsDir = process.env.WORKFLOWS_DIR || '/app/workflows';

  let importTimeout = null;
  let isImporting = false;

  try {
    const watcher = fs.watch(workflowsDir);
    console.log(`Watching workflows directory for changes: ${workflowsDir}`);

    for await (const event of watcher) {
      if (event.filename && event.filename.endsWith('.json')) {
        console.log(`Detected change in workflows directory: ${event.filename}`);

        // Clear existing timeout to implement debouncing
        if (importTimeout) {
          clearTimeout(importTimeout);
        }

        // Re-import workflows after a short delay to avoid multiple rapid imports
        importTimeout = setTimeout(async () => {
          // Prevent concurrent executions
          if (!isImporting) {
            isImporting = true;
            try {
              await scanAndImportWorkflows();
            } finally {
              isImporting = false;
            }
          }
        }, 1000);
      }
    }
  } catch (error) {
    console.log('Workflow directory watching disabled:', error.message);
  }
}

module.exports = {
  scanAndImportWorkflows,
  watchWorkflowsDirectory
};
