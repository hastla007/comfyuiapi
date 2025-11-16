const request = require('supertest');
const express = require('express');
const jobsRoutes = require('../../routes/jobs');
const { pool } = require('../../database');
const { authenticateApiKey, requireAdmin } = require('../../middleware/auth');
const jobProcessor = require('../../services/jobProcessor');

// Mock dependencies
jest.mock('../../database');
jest.mock('../../middleware/auth');
jest.mock('../../services/jobProcessor');
jest.mock('../../utils/logger');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobsRoutes);

describe('Jobs Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticateApiKey.mockImplementation((req, res, next) => next());
    requireAdmin.mockImplementation((req, res, next) => next());
  });

  describe('POST /api/jobs', () => {
    test('should create a job', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Workflow check
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'queued' }] }); // Insert job

      const response = await request(app)
        .post('/api/jobs')
        .send({ workflow_id: 1, parameters: { key: 'value' } })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.job).toBeDefined();
    });

    test('should reject missing workflow_id', async () => {
      const response = await request(app)
        .post('/api/jobs')
        .send({ parameters: {} })
        .expect(400);

      expect(response.body.error).toContain('workflow_id is required');
    });

    test('should reject invalid parameters type', async () => {
      const response = await request(app)
        .post('/api/jobs')
        .send({ workflow_id: 1, parameters: 'not an object' })
        .expect(400);

      expect(response.body.error).toContain('must be an object');
    });

    test('should return 404 for non-existent workflow', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/jobs')
        .send({ workflow_id: 999, parameters: {} })
        .expect(404);

      expect(response.body.error).toContain('Workflow not found');
    });

    test('should validate container exists if specified', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Workflow exists
        .mockResolvedValueOnce({ rows: [] }); // Container not found

      const response = await request(app)
        .post('/api/jobs')
        .send({ workflow_id: 1, container_id: 'invalid', parameters: {} })
        .expect(404);

      expect(response.body.error).toContain('Container not found');
    });
  });

  describe('GET /api/jobs', () => {
    test('should list jobs with pagination', async () => {
      const mockJobs = [{ id: 1, status: 'completed' }];

      pool.query
        .mockResolvedValueOnce({ rows: mockJobs }) // Main query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Count query
        .mockResolvedValueOnce({ rows: [] }) // Stats query
        .mockResolvedValueOnce({ rows: [] }); // Timeline query

      const response = await request(app)
        .get('/api/jobs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.jobs).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('should respect limit and offset parameters', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/jobs?limit=10&offset=20')
        .expect(200);

      // Check that the query was called with bounded limit and offset
      const queryCall = pool.query.mock.calls[0][1];
      expect(queryCall).toContain(10);
      expect(queryCall).toContain(20);
    });

    test('should bound limit parameter', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/jobs?limit=9999')
        .expect(200);

      // Limit should be capped at 1000
      const queryCall = pool.query.mock.calls[0][1];
      expect(queryCall).toContain(1000);
    });

    test('should filter by status', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/jobs?status=completed')
        .expect(200);

      const queryString = pool.query.mock.calls[0][0];
      expect(queryString).toContain('j.status = $');
    });

    test('should validate workflow_id parameter', async () => {
      const response = await request(app)
        .get('/api/jobs?workflow_id=invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid workflow_id');
    });
  });

  describe('GET /api/jobs/:id', () => {
    test('should get job by ID', async () => {
      const mockJob = {
        id: 1,
        status: 'completed',
        workflow_name: 'Test'
      };

      pool.query.mockResolvedValue({ rows: [mockJob] });

      const response = await request(app)
        .get('/api/jobs/1')
        .expect(200);

      expect(response.body.id).toBe(1);
    });

    test('should return 404 for non-existent job', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/jobs/999')
        .expect(404);

      expect(response.body.error).toContain('Job not found');
    });
  });

  describe('GET /api/jobs/queue', () => {
    test('should get queue status', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Queue items
        .mockResolvedValueOnce({ rows: [{ status: 'queued', count: '5' }] }); // Stats

      const response = await request(app)
        .get('/api/jobs/queue')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queue).toBeDefined();
      expect(response.body.stats).toBeDefined();
    });
  });

  describe('POST /api/jobs/:id/cancel', () => {
    test('should cancel a queued job', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'queued' }]
      });
      jobProcessor.cancelJob.mockResolvedValue();

      const response = await request(app)
        .post('/api/jobs/1/cancel')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(jobProcessor.cancelJob).toHaveBeenCalledWith(1);
    });

    test('should reject invalid job ID', async () => {
      const response = await request(app)
        .post('/api/jobs/invalid/cancel')
        .expect(400);

      expect(response.body.error).toContain('Invalid job ID');
    });

    test('should reject cancelling completed job', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'completed' }]
      });

      const response = await request(app)
        .post('/api/jobs/1/cancel')
        .expect(400);

      expect(response.body.error).toContain('cannot be cancelled');
    });

    test('should return 404 for non-existent job', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/jobs/999/cancel')
        .expect(404);

      expect(response.body.error).toContain('Job not found');
    });
  });

  describe('POST /api/jobs/:id/retry', () => {
    test('should retry a failed job', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'failed' }] }) // Get job
        .mockResolvedValueOnce({ rows: [] }); // Update job

      const response = await request(app)
        .post('/api/jobs/1/retry')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should reject invalid job ID', async () => {
      const response = await request(app)
        .post('/api/jobs/invalid/retry')
        .expect(400);

      expect(response.body.error).toContain('Invalid job ID');
    });

    test('should reject retrying non-failed job', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'completed' }]
      });

      const response = await request(app)
        .post('/api/jobs/1/retry')
        .expect(400);

      expect(response.body.error).toContain('failed jobs can be retried');
    });
  });

  describe('GET /api/jobs/stats/processor', () => {
    test('should get processor stats', async () => {
      jobProcessor.getStats.mockReturnValue({ active: 2, queued: 5 });
      pool.query
        .mockResolvedValueOnce({ rows: [{ status: 'queued', count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ avg_seconds: '30' }] });

      const response = await request(app)
        .get('/api/jobs/stats/processor')
        .expect(200);

      expect(response.body.processor).toBeDefined();
      expect(response.body.queue).toBeDefined();
      expect(response.body.metrics).toBeDefined();
    });
  });

  describe('DELETE /api/jobs/cleanup', () => {
    test('should cleanup old jobs', async () => {
      pool.query.mockResolvedValue({ rowCount: 10 });

      const response = await request(app)
        .delete('/api/jobs/cleanup?days=7')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deleted).toBe(10);
    });

    test('should validate days parameter', async () => {
      const response = await request(app)
        .delete('/api/jobs/cleanup?days=invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid days parameter');
    });

    test('should reject days < 1', async () => {
      const response = await request(app)
        .delete('/api/jobs/cleanup?days=0')
        .expect(400);

      expect(response.body.error).toContain('Invalid days parameter');
    });

    test('should reject days > 365', async () => {
      const response = await request(app)
        .delete('/api/jobs/cleanup?days=400')
        .expect(400);

      expect(response.body.error).toContain('Invalid days parameter');
    });
  });
});
