const { pool } = require('../database');
const logger = require('../utils/logger');
const crypto = require('crypto');
const path = require('path');

/**
 * Storage Service
 * Handles distributed storage with S3/MinIO integration
 * Note: This is a framework - actual S3/MinIO SDK integration would require
 * installing aws-sdk or minio packages
 */

/**
 * Storage backend types
 */
const STORAGE_TYPES = {
  S3: 's3',
  MINIO: 'minio',
  LOCAL: 'local',
  AZURE: 'azure',
  GCS: 'gcs'
};

/**
 * Create storage backend
 * @param {string} name - Backend name
 * @param {string} type - Storage type
 * @param {Object} config - Backend configuration
 * @param {boolean} isDefault - Whether this is the default backend
 * @returns {Promise<Object>} Created storage backend
 */
async function createStorageBackend(name, type, config, isDefault = false) {
  const client = await pool.connect();

  try {
    // Validate config based on type
    validateStorageConfig(type, config);

    await client.query('BEGIN');

    // If this is set as default, unset other defaults
    if (isDefault) {
      await client.query(
        'UPDATE storage_backends SET is_default = false WHERE type = $1',
        [type]
      );
    }

    const result = await client.query(`
      INSERT INTO storage_backends (name, type, config, is_default, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `, [name, type, config, isDefault]);

    await client.query('COMMIT');

    logger.info('Storage backend created', {
      backendId: result.rows[0].id,
      type,
      isDefault
    });

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate storage configuration
 * @param {string} type - Storage type
 * @param {Object} config - Configuration object
 */
function validateStorageConfig(type, config) {
  switch (type) {
    case STORAGE_TYPES.S3:
    case STORAGE_TYPES.MINIO:
      if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
        throw new Error('S3/MinIO config requires endpoint, accessKeyId, secretAccessKey, and bucket');
      }
      break;
    case STORAGE_TYPES.LOCAL:
      if (!config.basePath) {
        throw new Error('Local storage requires basePath');
      }
      break;
    case STORAGE_TYPES.AZURE:
      if (!config.connectionString || !config.containerName) {
        throw new Error('Azure storage requires connectionString and containerName');
      }
      break;
    case STORAGE_TYPES.GCS:
      if (!config.projectId || !config.keyFilename || !config.bucketName) {
        throw new Error('GCS requires projectId, keyFilename, and bucketName');
      }
      break;
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

/**
 * Get default storage backend
 * @returns {Promise<Object>} Default storage backend
 */
async function getDefaultBackend() {
  const result = await pool.query(
    'SELECT * FROM storage_backends WHERE is_default = true AND is_active = true LIMIT 1'
  );

  if (result.rows.length === 0) {
    throw new Error('No default storage backend configured');
  }

  return result.rows[0];
}

/**
 * Get storage backend by ID
 * @param {number} backendId - Backend ID
 * @returns {Promise<Object>} Storage backend
 */
async function getBackendById(backendId) {
  const result = await pool.query(
    'SELECT * FROM storage_backends WHERE id = $1',
    [backendId]
  );

  if (result.rows.length === 0) {
    throw new Error('Storage backend not found');
  }

  return result.rows[0];
}

/**
 * Upload file to storage
 * @param {number} userId - User ID
 * @param {number} jobId - Job ID (optional)
 * @param {string} filename - Original filename
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} mimeType - MIME type
 * @param {number} backendId - Storage backend ID (optional, uses default if not provided)
 * @returns {Promise<Object>} Created media file record
 */
async function uploadFile(userId, jobId, filename, fileBuffer, mimeType, backendId = null) {
  const client = await pool.connect();

  try {
    // Get storage backend
    const backend = backendId ? await getBackendById(backendId) : await getDefaultBackend();

    // Generate storage key
    const ext = path.extname(filename);
    const storageKey = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
    const storagePath = `users/${userId}/jobs/${jobId || 'misc'}/${storageKey}`;

    // Upload to storage backend
    const cdnUrl = await uploadToBackend(backend, storagePath, fileBuffer, mimeType);

    // Check user storage quota
    await checkStorageQuota(userId, fileBuffer.length, client);

    // Create media file record
    const result = await client.query(`
      INSERT INTO media_files (
        user_id, job_id, storage_backend_id, filename,
        path, size_bytes, mime_type, storage_key, cdn_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId,
      jobId,
      backend.id,
      filename,
      storagePath,
      fileBuffer.length,
      mimeType,
      storageKey,
      cdnUrl
    ]);

    // Update user storage usage
    await client.query(
      'UPDATE users SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2',
      [fileBuffer.length, userId]
    );

    logger.info('File uploaded', {
      userId,
      jobId,
      filename,
      size: fileBuffer.length,
      backendId: backend.id
    });

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Upload to storage backend
 * @param {Object} backend - Storage backend configuration
 * @param {string} path - Storage path
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - MIME type
 * @returns {Promise<string>} CDN URL
 */
async function uploadToBackend(backend, path, buffer, mimeType) {
  // This is a placeholder - actual implementation would use S3/MinIO SDK
  switch (backend.type) {
    case STORAGE_TYPES.S3:
    case STORAGE_TYPES.MINIO:
      // Example with AWS SDK (not installed):
      // const AWS = require('aws-sdk');
      // const s3 = new AWS.S3({
      //   endpoint: backend.config.endpoint,
      //   accessKeyId: backend.config.accessKeyId,
      //   secretAccessKey: backend.config.secretAccessKey
      // });
      // await s3.putObject({
      //   Bucket: backend.config.bucket,
      //   Key: path,
      //   Body: buffer,
      //   ContentType: mimeType
      // }).promise();

      return `${backend.config.endpoint}/${backend.config.bucket}/${path}`;

    case STORAGE_TYPES.LOCAL:
      // Save to local filesystem
      const fs = require('fs').promises;
      const fullPath = `${backend.config.basePath}/${path}`;
      await fs.mkdir(require('path').dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return `/media/${path}`;

    default:
      throw new Error(`Upload not implemented for storage type: ${backend.type}`);
  }
}

/**
 * Check storage quota
 * @param {number} userId - User ID
 * @param {number} sizeBytes - File size in bytes
 * @param {Object} client - Database client
 */
async function checkStorageQuota(userId, sizeBytes, client) {
  const result = await client.query(
    'SELECT storage_quota_bytes, storage_used_bytes FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  const newUsage = (user.storage_used_bytes || 0) + sizeBytes;

  if (newUsage > user.storage_quota_bytes) {
    const error = new Error('Storage quota exceeded');
    error.code = 'QUOTA_EXCEEDED';
    throw error;
  }
}

/**
 * Delete file from storage
 * @param {number} fileId - Media file ID
 * @param {number} userId - User ID
 */
async function deleteFile(fileId, userId) {
  const client = await pool.connect();

  try {
    // Get file record
    const fileResult = await client.query(
      'SELECT * FROM media_files WHERE id = $1 AND user_id = $2',
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw new Error('File not found');
    }

    const file = fileResult.rows[0];

    // Get storage backend
    const backend = await getBackendById(file.storage_backend_id);

    // Delete from storage backend
    await deleteFromBackend(backend, file.path);

    // Delete record
    await client.query('DELETE FROM media_files WHERE id = $1', [fileId]);

    // Update user storage usage
    await client.query(
      'UPDATE users SET storage_used_bytes = storage_used_bytes - $1 WHERE id = $2',
      [file.size_bytes, userId]
    );

    logger.info('File deleted', {
      fileId,
      userId,
      size: file.size_bytes
    });
  } finally {
    client.release();
  }
}

/**
 * Delete from storage backend
 * @param {Object} backend - Storage backend
 * @param {string} path - File path
 */
async function deleteFromBackend(backend, path) {
  // Placeholder for actual deletion
  switch (backend.type) {
    case STORAGE_TYPES.S3:
    case STORAGE_TYPES.MINIO:
      // Example with AWS SDK:
      // await s3.deleteObject({
      //   Bucket: backend.config.bucket,
      //   Key: path
      // }).promise();
      logger.info('File deleted from S3/MinIO', { path });
      break;

    case STORAGE_TYPES.LOCAL:
      const fs = require('fs').promises;
      const fullPath = `${backend.config.basePath}/${path}`;
      await fs.unlink(fullPath);
      break;

    default:
      logger.warn(`Delete not implemented for storage type: ${backend.type}`);
  }
}

/**
 * Get file URL (generate signed URL if needed)
 * @param {number} fileId - Media file ID
 * @param {number} userId - User ID
 * @param {number} expiresIn - URL expiration in seconds (default 3600)
 * @returns {Promise<string>} File URL
 */
async function getFileUrl(fileId, userId, expiresIn = 3600) {
  const result = await pool.query(
    'SELECT * FROM media_files WHERE id = $1 AND user_id = $2',
    [fileId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('File not found');
  }

  const file = result.rows[0];

  // If CDN URL exists, return it
  if (file.cdn_url) {
    return file.cdn_url;
  }

  // Generate signed URL for S3/MinIO
  const backend = await getBackendById(file.storage_backend_id);

  if (backend.type === STORAGE_TYPES.S3 || backend.type === STORAGE_TYPES.MINIO) {
    // Example with AWS SDK:
    // return s3.getSignedUrl('getObject', {
    //   Bucket: backend.config.bucket,
    //   Key: file.path,
    //   Expires: expiresIn
    // });
    return `${backend.config.endpoint}/${backend.config.bucket}/${file.path}`;
  }

  return file.path;
}

/**
 * List user files
 * @param {number} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Files list
 */
async function listUserFiles(userId, options = {}) {
  const { limit = 50, offset = 0, jobId } = options;

  let query = `
    SELECT mf.*, sb.name as backend_name, sb.type as backend_type
    FROM media_files mf
    LEFT JOIN storage_backends sb ON mf.storage_backend_id = sb.id
    WHERE mf.user_id = $1
  `;
  const params = [userId];
  let paramIndex = 2;

  if (jobId) {
    query += ` AND mf.job_id = $${paramIndex}`;
    params.push(jobId);
    paramIndex++;
  }

  query += ` ORDER BY mf.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM media_files WHERE user_id = $1';
  const countParams = [userId];

  if (jobId) {
    countQuery += ' AND job_id = $2';
    countParams.push(jobId);
  }

  const countResult = await pool.query(countQuery, countParams);

  return {
    files: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

/**
 * Get user storage statistics
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Storage statistics
 */
async function getUserStorageStats(userId) {
  const result = await pool.query(`
    SELECT
      u.storage_quota_bytes,
      u.storage_used_bytes,
      COUNT(mf.id) as file_count,
      SUM(mf.size_bytes) as total_size
    FROM users u
    LEFT JOIN media_files mf ON u.id = mf.user_id
    WHERE u.id = $1
    GROUP BY u.id, u.storage_quota_bytes, u.storage_used_bytes
  `, [userId]);

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const stats = result.rows[0];

  return {
    quota_bytes: stats.storage_quota_bytes,
    used_bytes: stats.storage_used_bytes || 0,
    available_bytes: stats.storage_quota_bytes - (stats.storage_used_bytes || 0),
    usage_percent: Math.round(((stats.storage_used_bytes || 0) / stats.storage_quota_bytes) * 100),
    file_count: parseInt(stats.file_count) || 0
  };
}

module.exports = {
  STORAGE_TYPES,
  createStorageBackend,
  getDefaultBackend,
  getBackendById,
  uploadFile,
  deleteFile,
  getFileUrl,
  listUserFiles,
  getUserStorageStats
};
