const request = require('supertest');
const express = require('express');
const containersRoutes = require('../../routes/containers');
const { pool } = require('../../database');
const { authenticateApiKey, requireAdmin } = require('../../middleware/auth');
const docker = require('../../docker');

// Mock dependencies
jest.mock('../../database');
jest.mock('../../middleware/auth');
jest.mock('../../docker');
jest.mock('../../utils/logger');

const app = express();
app.use(express.json());
app.use('/api/containers', containersRoutes);

describe('Containers Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock auth middleware to always allow
    authenticateApiKey.mockImplementation((req, res, next) => next());
    requireAdmin.mockImplementation((req, res, next) => next());
  });

  describe('GET /api/containers', () => {
    test('should list all containers', async () => {
      const mockDockerContainers = [
        { Id: 'abc123', Names: ['/container1'], State: 'running', Ports: [], Created: Date.now() }
      ];
      const mockDbContainers = {
        rows: [{ id: 42, container_id: 'abc123', name: 'container1', port: 8188 }]
      };

      docker.getAllContainers.mockResolvedValue(mockDockerContainers);
      pool.query.mockResolvedValue(mockDbContainers);

      const response = await request(app)
        .get('/api/containers')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.containers).toHaveLength(1);
      expect(response.body.containers[0].name).toBe('container1');
      expect(response.body.containers[0].id).toBe('abc123');
      expect(response.body.containers[0].dockerId).toBe('abc123');
      expect(response.body.containers[0].dbId).toBe(42);
      expect(response.body.containers[0].container_id).toBe('abc123');
    });

    test('should handle Docker errors', async () => {
      docker.getAllContainers.mockRejectedValue(new Error('Docker error'));
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/containers')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/containers', () => {
    test('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/containers')
        .send({ port: 8188 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Name and port');
    });

    test('should reject missing port', async () => {
      const response = await request(app)
        .post('/api/containers')
        .send({ name: 'test' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Name and port');
    });

    test('should reject invalid container name', async () => {
      const response = await request(app)
        .post('/api/containers')
        .send({ name: '-invalid', port: 8188 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('alphanumeric');
    });

    test('should reject invalid port range', async () => {
      const response = await request(app)
        .post('/api/containers')
        .send({ name: 'valid', port: 100 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('1024-65535');
    });

    test('should reject non-integer port', async () => {
      const response = await request(app)
        .post('/api/containers')
        .send({ name: 'valid', port: 'abc' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('integer');
    });

    test('should reject port already in use', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ port: 8188 }] }), // port check
        release: jest.fn()
      };

      pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/containers')
        .send({ name: 'valid', port: 8188 })
        .expect(400);

      expect(response.body.error).toContain('already in use');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('POST /api/containers/:id/start', () => {
    test('should start a container', async () => {
      docker.startContainer.mockResolvedValue();
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/containers/abc123/start')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(docker.startContainer).toHaveBeenCalledWith('abc123');
    });

    test('should handle start errors', async () => {
      docker.startContainer.mockRejectedValue(new Error('Start failed'));
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/containers/abc123/start')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/containers/:id/stop', () => {
    test('should stop a container', async () => {
      docker.stopContainer.mockResolvedValue();
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/containers/abc123/stop')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(docker.stopContainer).toHaveBeenCalledWith('abc123');
    });
  });

  describe('POST /api/containers/:id/restart', () => {
    test('should restart a container', async () => {
      docker.restartContainer.mockResolvedValue();
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/containers/abc123/restart')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(docker.restartContainer).toHaveBeenCalledWith('abc123');
    });
  });

  describe('DELETE /api/containers/:id', () => {
    test('should remove a container', async () => {
      docker.removeContainer.mockResolvedValue();
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/containers/abc123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(docker.removeContainer).toHaveBeenCalledWith('abc123', true);
    });
  });

  describe('GET /api/containers/:id/logs', () => {
    test('should get container logs with default tail', async () => {
      docker.getContainerLogs.mockResolvedValue('log line 1\nlog line 2');

      const response = await request(app)
        .get('/api/containers/abc123/logs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(docker.getContainerLogs).toHaveBeenCalledWith('abc123', 100);
    });

    test('should respect tail parameter', async () => {
      docker.getContainerLogs.mockResolvedValue('logs');

      await request(app)
        .get('/api/containers/abc123/logs?tail=50')
        .expect(200);

      expect(docker.getContainerLogs).toHaveBeenCalledWith('abc123', 50);
    });

    test('should bound tail parameter to prevent DoS', async () => {
      docker.getContainerLogs.mockResolvedValue('logs');

      await request(app)
        .get('/api/containers/abc123/logs?tail=99999')
        .expect(200);

      // Should be capped at 10000
      expect(docker.getContainerLogs).toHaveBeenCalledWith('abc123', 10000);
    });

    test('should enforce minimum tail value', async () => {
      docker.getContainerLogs.mockResolvedValue('logs');

      await request(app)
        .get('/api/containers/abc123/logs?tail=-5')
        .expect(200);

      // Should be at least 1
      expect(docker.getContainerLogs).toHaveBeenCalledWith('abc123', 1);
    });
  });

  describe('GET /api/containers/:id/stats', () => {
    test('should get container stats', async () => {
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 200 },
          system_cpu_usage: 1000,
          online_cpus: 2
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 800
        },
        memory_stats: {
          usage: 512,
          limit: 1024
        },
        gpu_stats: [
          { index: 0, name: 'GPU 0', memory_total: 2048, memory_used: 512, utilization_gpu: 50 }
        ]
      };
      docker.getContainerStats.mockResolvedValue(mockStats);
      pool.query.mockResolvedValue({ rows: [{ max_concurrent_jobs: 3, active_jobs: 1 }] });

      const response = await request(app)
        .get('/api/containers/abc123/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toEqual(mockStats);
      expect(response.body.summary.gpu[0].memoryUsed).toBe(512);
      expect(response.body.load.active_jobs).toBe(1);
      expect(response.body.load.max_concurrent_jobs).toBe(3);
      expect(response.body.load.load_percent).toBeCloseTo((1 / 3) * 100);
    });
  });

  describe('GET /api/containers/load-status/:id', () => {
    test('returns container load snapshot', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 1, active_job_count: 2, load_percent: 50 }] });

      const response = await request(app)
        .get('/api/containers/load-status/1')
        .expect(200);

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM container_load_status
       WHERE ($1::int IS NOT NULL AND id = $1::int)
         OR id = (SELECT id FROM containers WHERE container_id = $2)` ,
        [1, '1']
      );
      expect(response.body.data.active_job_count).toBe(2);
    });
  });
});
