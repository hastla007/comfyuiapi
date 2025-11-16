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
    'http://localhost',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:3006',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:3006',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];

  if (configured.includes('*')) {
    return ['*'];
  }

  return Array.from(new Set(configured.length ? configured : defaults));
};

const isLocalhostOrigin = (origin) => {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
  } catch (error) {
    return false;
  }
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return true; // Allow same-origin or server-to-server requests
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;

  const allowLocalWildcard = allowedOrigins.some(isLocalhostOrigin);
  if (allowLocalWildcard && isLocalhostOrigin(origin)) {
    return true; // Allow any localhost/127.0.0.1 origin when local dev hosts are whitelisted
  }

  return false;
};

const corsOptions = (req, callback) => {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.header('Origin');

  if (isOriginAllowed(origin, allowedOrigins)) {
    return callback(null, { origin: true, credentials: true });
  }

  return callback(new Error('Not allowed by CORS'));
};

const buildSocketCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();
  return {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    credentials: true
  };
};

module.exports = {
  corsMiddleware: cors(corsOptions),
  corsOptions,
  buildSocketCorsOptions,
  getAllowedOrigins,
  isOriginAllowed,
  parseOrigins
};
