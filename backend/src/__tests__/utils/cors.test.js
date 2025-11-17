const { parseOrigins, buildSocketCorsOptions } = require('../../utils/cors');
const express = require('express');
const request = require('supertest');

describe('CORS utilities', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('parses comma-separated origins', () => {
    expect(parseOrigins('http://a.com, http://b.com')).toEqual(['http://a.com', 'http://b.com']);
  });

  it('returns sensible defaults when no env configured', () => {
    jest.resetModules();
    const { getAllowedOrigins: freshGetAllowedOrigins } = require('../../utils/cors');
    expect(freshGetAllowedOrigins()).toEqual([
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
      'http://127.0.0.1:5173',
      'https://localhost',
      'https://127.0.0.1'
    ]);
  });

  it('allows https localhost origins by default', async () => {
    jest.resetModules();
    const { corsMiddleware: middleware } = require('../../utils/cors');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test').set('Origin', 'https://localhost:8443');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost:8443');
  });

  it('allows wildcard configuration', () => {
    process.env.CORS_ORIGINS = '*';
    jest.resetModules();
    const { getAllowedOrigins: freshGetAllowedOrigins, isOriginAllowed: freshIsOriginAllowed } = require('../../utils/cors');
    const origins = freshGetAllowedOrigins();

    expect(origins).toEqual(['*']);
    expect(freshIsOriginAllowed('http://anywhere.com', origins)).toBe(true);
  });

  it('rejects disallowed origins in middleware', async () => {
    process.env.CORS_ORIGINS = 'http://allowed.com';
    jest.resetModules();
    const { corsMiddleware: middleware } = require('../../utils/cors');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test').set('Origin', 'http://blocked.com');
    expect(response.status).toBe(500);
    expect(response.error).toBeDefined();
  });

  it('allows configured origins in middleware', async () => {
    process.env.CORS_ORIGINS = 'http://allowed.com';
    jest.resetModules();
    const { corsMiddleware: middleware } = require('../../utils/cors');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test').set('Origin', 'http://allowed.com');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://allowed.com');
  });

  it('builds socket.io compatible options', () => {
    process.env.CORS_ORIGINS = 'http://allowed.com';
    jest.resetModules();
    const { buildSocketCorsOptions: freshBuildSocketCorsOptions } = require('../../utils/cors');

    expect(freshBuildSocketCorsOptions()).toEqual({
      origin: ['http://allowed.com'],
      credentials: true
    });
  });

  it('returns wildcard origin for sockets when configured', () => {
    process.env.CORS_ORIGINS = '*';
    jest.resetModules();
    const { buildSocketCorsOptions: freshBuildSocketCorsOptions } = require('../../utils/cors');

    expect(freshBuildSocketCorsOptions()).toEqual({
      origin: '*',
      credentials: true
    });
  });

  it('allows any localhost variant when localhost is configured', async () => {
    jest.resetModules();
    const { corsMiddleware: middleware } = require('../../utils/cors');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test').set('Origin', 'http://127.0.0.1:9999');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:9999');
  });

  it('rejects unknown origins when no localhost defaults are present', async () => {
    process.env.CORS_ORIGINS = 'http://example.com';
    jest.resetModules();
    const { corsMiddleware: middleware } = require('../../utils/cors');

    const app = express();
    app.use(middleware);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/test').set('Origin', 'http://malicious.test');
    expect(response.status).toBe(500);
    expect(response.error).toBeDefined();
  });
});
