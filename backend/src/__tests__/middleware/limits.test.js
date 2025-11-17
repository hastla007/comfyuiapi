const express = require('express');
const request = require('supertest');
const { createApiLimiter, createJobLimiter, skipSafeReads } = require('../../middleware/limits');

describe('Rate limiters', () => {
  test('skipSafeReads allows GET requests to bypass limits', async () => {
    const limiter = createApiLimiter({ max: 1, windowMs: 60 * 1000 });
    const app = express();
    app.use(limiter);
    app.get('/api/health', (req, res) => res.json({ ok: true, skipped: skipSafeReads(req) }));

    const first = await request(app).get('/api/health');
    const second = await request(app).get('/api/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toEqual({ ok: true, skipped: true });
    expect(second.body).toEqual({ ok: true, skipped: true });
  });

  test('non-GET requests are still rate limited', async () => {
    const limiter = createJobLimiter({ max: 1, windowMs: 60 * 1000 });
    const app = express();
    app.use(limiter);
    app.post('/api/jobs', (req, res) => res.json({ ok: true }));

    const first = await request(app).post('/api/jobs');
    const second = await request(app).post('/api/jobs');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.message).toBe('Too many jobs created, please try again later.');
  });
});
