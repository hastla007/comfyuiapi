const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Media Storage Service
 * Handles downloading input images and uploading output images
 * Supports local filesystem storage (S3 support can be added later)
 */
class MediaStorage {
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || 'local';
    this.localStoragePath = process.env.LOCAL_STORAGE_PATH || '/app/output';
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    this.maxFileSize = 50 * 1024 * 1024; // 50MB max file size
  }

  /**
   * Download an image from a URL
   * @param {string} url - URL of the image to download
   * @returns {Promise<Buffer>} - Image buffer
   */
  async downloadImage(url) {
    try {
      logger.info(`Downloading image from ${url}`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        maxContentLength: this.maxFileSize,
        headers: {
          'User-Agent': 'ComfyUI-API/1.0'
        }
      });

      const buffer = Buffer.from(response.data);

      // Validate it's an image
      const mimeType = response.headers['content-type'];
      if (!mimeType || !mimeType.startsWith('image/')) {
        throw new Error(`Invalid content type: ${mimeType}. Expected image/*`);
      }

      logger.info(`Downloaded image: ${buffer.length} bytes, type: ${mimeType}`);

      return buffer;
    } catch (error) {
      logger.error(`Failed to download image from ${url}:`, error);
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  /**
   * Save an image buffer to local storage
   * @param {Buffer} buffer - Image buffer
   * @param {string} filename - Original filename (optional)
   * @returns {Promise<string>} - URL to access the saved image
   */
  async saveImage(buffer, filename = null) {
    try {
      // Generate unique filename if not provided
      if (!filename) {
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const timestamp = Date.now();
        filename = `${timestamp}-${hash}.png`;
      }

      // Ensure storage directory exists
      await fs.mkdir(this.localStoragePath, { recursive: true });

      const filepath = path.join(this.localStoragePath, filename);

      // Write file
      await fs.writeFile(filepath, buffer);

      logger.info(`Saved image to ${filepath}`);

      // Return URL
      const url = `${this.baseUrl}/api/media/${filename}`;
      return url;
    } catch (error) {
      logger.error(`Failed to save image:`, error);
      throw new Error(`Failed to save image: ${error.message}`);
    }
  }

  /**
   * Copy an image from ComfyUI output directory to our storage
   * @param {string} comfyuiPath - Path to the image in ComfyUI output directory
   * @returns {Promise<string>} - URL to access the saved image
   */
  async copyFromComfyUI(comfyuiPath) {
    try {
      // Read the file from ComfyUI output
      const buffer = await fs.readFile(comfyuiPath);

      // Extract filename
      const filename = path.basename(comfyuiPath);

      // Save to our storage
      return await this.saveImage(buffer, filename);
    } catch (error) {
      logger.error(`Failed to copy from ComfyUI:`, error);
      throw new Error(`Failed to copy from ComfyUI: ${error.message}`);
    }
  }

  /**
   * Get an image from storage
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>} - Image buffer
   */
  async getImage(filename) {
    try {
      // Sanitize filename to prevent path traversal
      const sanitizedFilename = path.basename(filename);
      const filepath = path.join(this.localStoragePath, sanitizedFilename);

      // Check file exists
      await fs.access(filepath);

      // Read and return file
      const buffer = await fs.readFile(filepath);
      return buffer;
    } catch (error) {
      logger.error(`Failed to get image ${filename}:`, error);
      throw new Error(`Image not found: ${filename}`);
    }
  }

  /**
   * Delete an image from storage
   * @param {string} filename - Filename
   */
  async deleteImage(filename) {
    try {
      const sanitizedFilename = path.basename(filename);
      const filepath = path.join(this.localStoragePath, sanitizedFilename);

      await fs.unlink(filepath);
      logger.info(`Deleted image: ${filename}`);
    } catch (error) {
      // Don't throw error if file doesn't exist
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to delete image ${filename}:`, error);
      }
    }
  }

  /**
   * Clean up old images (older than specified days)
   * @param {number} days - Number of days to keep images
   * @returns {Promise<number>} - Number of files deleted
   */
  async cleanupOldImages(days = 7) {
    try {
      const files = await fs.readdir(this.localStoragePath);
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.localStoragePath, file);
        const stats = await fs.stat(filepath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filepath);
          deletedCount++;
        }
      }

      logger.info(`Cleaned up ${deletedCount} old images`);
      return deletedCount;
    } catch (error) {
      logger.error(`Failed to cleanup old images:`, error);
      throw error;
    }
  }

  /**
   * Get storage stats
   */
  async getStats() {
    try {
      const files = await fs.readdir(this.localStoragePath);
      let totalSize = 0;

      for (const file of files) {
        const filepath = path.join(this.localStoragePath, file);
        const stats = await fs.stat(filepath);
        totalSize += stats.size;
      }

      return {
        fileCount: files.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        storageType: this.storageType,
        storagePath: this.localStoragePath
      };
    } catch (error) {
      logger.error(`Failed to get storage stats:`, error);
      return {
        fileCount: 0,
        totalSize: 0,
        error: error.message
      };
    }
  }
}

// Singleton instance
const mediaStorage = new MediaStorage();

module.exports = mediaStorage;
