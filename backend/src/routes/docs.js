const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const router = express.Router();

const DOC_PATH = path.resolve(__dirname, '..', '..', 'API_DOCUMENTATION.md');

router.get('/', async (_req, res) => {
  try {
    const content = await fs.promises.readFile(DOC_PATH, 'utf-8');
    res.type('text/markdown').send(content);
  } catch (error) {
    logger.error('Failed to read API documentation', { error: error.message });
    res.status(500).json({ success: false, error: 'Unable to load API documentation' });
  }
});

module.exports = router;
