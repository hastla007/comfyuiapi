const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../routes/health');

// Mock dependencies
jest.mock('../../database', () => ({
  pool: {
    query: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0
  }
}));

jest.mock('../../docker', () => ({
  listContainers: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

const app = express();
app.use('/health', healthRoutes);

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status when all services are up', async () => {
      const { pool } = require('../../database');
      const docker = require('../../docker');

      pool.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      docker.listContainers.mockResolvedValue([
        { State: 'running' },
        { State: 'running' }
      ]);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('docker');
    });

    it('should return degraded status when database is down', async () => {
      const { pool } = require('../../database');
      const docker = require('../../docker');

      pool.query.mockRejectedValue(new Error('Connection failed'));
      docker.listContainers.mockResolvedValue([]);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
    });
  });

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alive', true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/metrics/custom', () => {
    it('should return system metrics', async () => {
      const response = await request(app).get('/health/metrics/custom');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('cpu');
      expect(response.body.metrics).toHaveProperty('memory');
    });
  });
});
