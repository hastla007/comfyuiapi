const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../database');

/**
 * Trigger webhook/callback for job completion
 */
async function triggerWebhook(callbackUrl, payload, jobId) {
  try {
    // Validate callback URL
    if (!isValidCallbackUrl(callbackUrl)) {
      console.error('Invalid callback URL:', callbackUrl);
      return false;
    }

    // Generate signature for security
    const timestamp = new Date().toISOString();
    const signature = generateWebhookSignature(payload, timestamp);

    // Send webhook request
    const response = await axios.post(callbackUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'User-Agent': 'ComfyUI-API-Webhook/1.0'
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status >= 200 && status < 300
    });

    // Log successful webhook
    console.log(`Webhook sent successfully for job ${jobId}:`, response.status);

    // Update callback attempts
    await pool.query(
      `UPDATE jobs
       SET callback_attempts = callback_attempts + 1,
           callback_last_attempt = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId]
    );

    return true;
  } catch (error) {
    console.error(`Webhook failed for job ${jobId}:`, error.message);

    // Update callback attempts
    await pool.query(
      `UPDATE jobs
       SET callback_attempts = callback_attempts + 1,
           callback_last_attempt = CURRENT_TIMESTAMP
       WHERE job_id = $1`,
      [jobId]
    );

    // Retry logic (up to 3 attempts)
    const result = await pool.query(
      'SELECT callback_attempts FROM jobs WHERE job_id = $1',
      [jobId]
    );

    if (result.rows.length > 0 && result.rows[0].callback_attempts < 3) {
      // Schedule retry after exponential backoff
      const retryDelay = Math.pow(2, result.rows[0].callback_attempts) * 1000; // 2s, 4s, 8s
      setTimeout(() => {
        triggerWebhook(callbackUrl, payload, jobId);
      }, retryDelay);
    }

    return false;
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook
 */
function generateWebhookSignature(payload, timestamp) {
  // In production, use a secret key from environment
  const secret = process.env.WEBHOOK_SECRET || 'default-webhook-secret-change-me';

  const message = `${payload.job_id}:${payload.status}:${timestamp}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, timestamp, signature) {
  const expectedSignature = generateWebhookSignature(payload, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate callback URL
 */
function isValidCallbackUrl(url) {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Prevent SSRF attacks - block private IP ranges
    const hostname = parsed.hostname;

    // Block localhost, 127.x.x.x
    if (hostname === 'localhost' || hostname.startsWith('127.')) {
      return false;
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Block link-local addresses (169.254.x.x)
    if (hostname.startsWith('169.254.')) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Retry failed webhooks
 */
async function retryFailedWebhooks() {
  // Get jobs with failed callbacks that haven't exceeded max attempts
  const result = await pool.query(
    `SELECT j.job_id, j.callback_url, j.model, j.status, j.result, j.error, j.completed_at, j.callback_attempts
     FROM jobs j
     WHERE j.callback_url IS NOT NULL
       AND j.status IN ('completed', 'failed')
       AND j.callback_attempts < 3
       AND j.callback_last_attempt < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
       AND j.completed_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
     ORDER BY j.completed_at ASC
     LIMIT 10`,
    []
  );

  for (const job of result.rows) {
    const payload = {
      job_id: job.job_id,
      status: job.status,
      model: job.model,
      completed_at: job.completed_at,
      result: job.result,
      error: job.error
    };

    await triggerWebhook(job.callback_url, payload, job.job_id);
  }

  return result.rows.length;
}

module.exports = {
  triggerWebhook,
  generateWebhookSignature,
  verifyWebhookSignature,
  isValidCallbackUrl,
  retryFailedWebhooks
};
