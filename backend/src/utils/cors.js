const cors = require('cors');

const parseOrigins = (rawOrigins) => {
  if (!rawOrigins) return [];
  return rawOrigins
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

const getAllowedOrigins = () => {
  const configured = parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN);
  const defaults = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  if (configured.includes('*')) {
    return ['*'];
  }

  return Array.from(new Set(configured.length ? configured : defaults));
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return true; // Allow same-origin or server-to-server requests
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
};

const corsOptions = (req, callback) => {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.header('Origin');

  if (isOriginAllowed(origin, allowedOrigins)) {
    return callback(null, { origin: true, credentials: true });
  }

  return callback(new Error('Not allowed by CORS'));
};

module.exports = {
  corsMiddleware: cors(corsOptions),
  corsOptions,
  getAllowedOrigins,
  isOriginAllowed,
  parseOrigins
};
