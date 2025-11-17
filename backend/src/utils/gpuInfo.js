const { exec } = require('child_process');
const util = require('util');
const logger = require('./logger');

const execAsync = util.promisify(exec);

/**
 * Collect GPU information using nvidia-smi when available.
 * Returns an array of GPU objects with memory (bytes) and utilization percent.
 */
async function getGpuInfo() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits'
    );

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [index, name, total, used, free, util] = line.split(',').map(part => part.trim());
        const totalBytes = Number(total) * 1024 * 1024;
        const usedBytes = Number(used) * 1024 * 1024;
        const freeBytes = Number(free) * 1024 * 1024;

        return {
          index: Number(index),
          name,
          memory: {
            total: isFinite(totalBytes) ? totalBytes : 0,
            used: isFinite(usedBytes) ? usedBytes : 0,
            free: isFinite(freeBytes) ? freeBytes : 0,
            percent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
          },
          utilization: util ? Number(util) : 0
        };
      });
  } catch (error) {
    logger.debug('GPU info unavailable (nvidia-smi missing or no GPUs):', error.message);
    return [];
  }
}

module.exports = { getGpuInfo };
