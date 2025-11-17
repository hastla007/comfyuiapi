const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getVolumeBase } = require('../docker');
const logger = require('../utils/logger');

const MODEL_FOLDERS = {
  checkpoints: 'checkpoints',
  loras: 'loras',
  upscale: 'upscale_models',
  vae: 'vae',
  clip: 'clip'
};

async function listModels() {
  const base = path.join(getVolumeBase(), 'models');
  const result = {};

  for (const [key, folder] of Object.entries(MODEL_FOLDERS)) {
    const target = path.join(base, folder);
    try {
      const entries = await fs.readdir(target);
      result[key] = entries.filter(name => !name.startsWith('.'));
    } catch (error) {
      logger.debug(`Model folder missing for ${key}:`, error.message);
      result[key] = [];
    }
  }

  return result;
}

router.get('/', async (req, res) => {
  try {
    const models = await listModels();
    res.json({ success: true, models });
  } catch (error) {
    logger.error('Failed to list models:', error);
    res.status(500).json({ success: false, error: 'Failed to list models' });
  }
});

module.exports = router;
