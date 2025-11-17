const rateLimit = require('express-rate-limit');

// Shared allowlist: skip rate limiting for safe GET requests so health/metrics
// polling and dashboard queries don't exhaust the IP budget and block actions
// like container start/stop or workflow assignment.
const skipSafeReads = (req) => req.method === 'GET';

const asJson = (req, res, next, options) => res.status(options.statusCode).json({
  success: false,
  message: options.message
});

const createApiLimiter = (overrides = {}) => rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipSafeReads,
  handler: asJson,
  ...overrides
});

const createJobLimiter = (overrides = {}) => rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many jobs created, please try again later.',
  skip: (req) => req.method === 'GET',
  handler: asJson,
  ...overrides
});

// Default instances used by the server
const apiLimiter = createApiLimiter();
const jobLimiter = createJobLimiter();

module.exports = {
  apiLimiter,
  jobLimiter,
  createApiLimiter,
  createJobLimiter,
  skipSafeReads
};
