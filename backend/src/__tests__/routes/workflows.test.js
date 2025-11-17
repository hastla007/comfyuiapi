const request = require('supertest');
const express = require('express');
const { pool } = require('../../database');
const { authenticateApiKey, requireAdmin } = require('../../middleware/auth');
const fs = require('fs');

// Mock dependencies
jest.mock('../../database');
jest.mock('../../middleware/auth');
jest.mock('../../utils/logger');
jest.mock('../../docker', () => ({
  getContainer: jest.fn(),
  restartContainer: jest.fn(),
  getVolumeBase: jest.fn(() => '/app'),
}));
jest.mock('fs', () => {
  const EventEmitter = require('events');
  const mockStream = new EventEmitter();
  mockStream.write = jest.fn();
  mockStream.end = jest.fn();

  return {
    promises: {
      mkdir: jest.fn().mockResolvedValue(),
      writeFile: jest.fn().mockResolvedValue()
    },
    existsSync: jest.fn().mockReturnValue(true),
    stat: jest.fn((path, cb) => cb(null, { size: 0 })),
    createWriteStream: jest.fn().mockReturnValue(mockStream)
  };
});

const docker = require('../../docker');
const workflowsRoutes = require('../../routes/workflows');

const app = express();
app.use(express.json());
app.use('/api/workflows', workflowsRoutes);

describe('Workflows Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticateApiKey.mockImplementation((req, res, next) => next());
    requireAdmin.mockImplementation((req, res, next) => next());
    docker.getContainer.mockReset();
    docker.restartContainer.mockResolvedValue({ State: { Status: 'running' } });
    docker.getVolumeBase.mockReturnValue('/app');
    docker.getContainer.mockReturnValue({
      inspect: jest.fn().mockResolvedValue({
        Name: '/test-container',
        NetworkSettings: { Ports: { '8188/tcp': [{ HostPort: '8188' }] } },
        HostConfig: { PortBindings: { '8188/tcp': [{ HostPort: '8188' }] } },
        State: { Status: 'running' }
      })
    });
  });

  describe('GET /api/workflows', () => {
    test('should list all workflows', async () => {
      const mockWorkflows = [
        { id: 1, name: 'Workflow 1', description: 'Test', created_at: new Date() }
      ];

      pool.query.mockResolvedValue({ rows: mockWorkflows });

      const response = await request(app)
        .get('/api/workflows')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workflows).toHaveLength(1);
    });

    test('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/workflows')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/workflows/:id', () => {
    test('should get specific workflow', async () => {
      const mockWorkflow = {
        id: 1,
        name: 'Test Workflow',
        workflow_json: {}
      };

      pool.query.mockResolvedValue({ rows: [mockWorkflow] });

      const response = await request(app)
        .get('/api/workflows/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workflow.name).toBe('Test Workflow');
    });

    test('should return 404 for non-existent workflow', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/workflows/999')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should reject invalid workflow ID', async () => {
      const response = await request(app)
        .get('/api/workflows/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid workflow ID');
    });

    test('should reject negative workflow ID', async () => {
      const response = await request(app)
        .get('/api/workflows/-1')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/workflows', () => {
    test('should create workflow', async () => {
      const newWorkflow = {
        name: 'New Workflow',
        description: 'Test description',
        workflowJson: { nodes: [] }
      };

      const mockResult = { rows: [{ id: 1, ...newWorkflow }] };
      pool.query.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/workflows')
        .send(newWorkflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workflow.name).toBe('New Workflow');
    });

    test('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({ workflowJson: {} })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Name and workflow JSON');
    });

    test('should reject missing workflowJson', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({ name: 'Test' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject name longer than 255 characters', async () => {
      const longName = 'a'.repeat(256);

      const response = await request(app)
        .post('/api/workflows')
        .send({ name: longName, workflowJson: {} })
        .expect(400);

      expect(response.body.error).toContain('255 characters');
    });

    test('should reject workflow JSON larger than 5MB', async () => {
      // Create a large JSON object (> 5MB)
      const largeJson = { data: 'x'.repeat(6 * 1024 * 1024) };

      const response = await request(app)
        .post('/api/workflows')
        .send({ name: 'Test', workflowJson: largeJson });

      // Express may reject with 413 (payload too large) before our validation
      // or our validation may reject with 400
      expect([400, 413]).toContain(response.status);
    });

    test('should reject non-object workflow JSON', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({ name: 'Test', workflowJson: 'not an object' })
        .expect(400);

      expect(response.body.error).toContain('valid object');
    });
  });

  describe('PUT /api/workflows/:id', () => {
    test('should update workflow', async () => {
      const updates = {
        name: 'Updated Workflow',
        description: 'Updated',
        workflowJson: { updated: true }
      };

      pool.query.mockResolvedValue({ rows: [{ id: 1, ...updates }] });

      const response = await request(app)
        .put('/api/workflows/1')
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workflow.name).toBe('Updated Workflow');
    });

    test('should return 404 for non-existent workflow', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/workflows/999')
        .send({ name: 'Test', workflowJson: {} })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should reject invalid workflow ID', async () => {
      const response = await request(app)
        .put('/api/workflows/invalid')
        .send({ name: 'Test', workflowJson: {} })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    test('should delete workflow not in use', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Check if in use
        .mockResolvedValueOnce({ rows: [] }); // Delete

      const response = await request(app)
        .delete('/api/workflows/1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should reject deleting workflow in use', async () => {
      pool.query.mockResolvedValue({ rows: [{ container_id: 'abc' }] });

      const response = await request(app)
        .delete('/api/workflows/1')
        .expect(400);

      expect(response.body.error).toContain('in use');
    });

    test('should reject invalid workflow ID', async () => {
      const response = await request(app)
        .delete('/api/workflows/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/workflows/:id/assign/:containerId', () => {
    test('should assign workflow to container', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 1, status: 'running' }] }) // Get container
          .mockResolvedValueOnce({ rows: [] }) // Update container
          .mockResolvedValueOnce({ rows: [{ workflow_json: {} }] }) // Get workflow
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn()
      };

      pool.connect.mockResolvedValue(mockClient);

    const response = await request(app)
      .post('/api/workflows/1/assign/abcdef123456')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(docker.restartContainer).toHaveBeenCalledWith('abcdef123456');
    expect(mockClient.release).toHaveBeenCalled();
  });

    test('should reject invalid container ID format', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/workflows/1/assign/invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid container ID');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should return 404 for non-existent container', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // Get container - not found
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: jest.fn()
      };

      pool.connect.mockResolvedValue(mockClient);

      const dockerError = new Error('not found');
      dockerError.statusCode = 404;
      docker.getContainer.mockImplementation(() => { throw dockerError; });

      const response = await request(app)
        .post('/api/workflows/1/assign/abcdef123456')
        .expect(404);

      expect(response.body.error).toContain('Container not found');
    });

    test('should surface file system errors when assigning workflow', async () => {
      const writeError = new Error('write failed');
      fs.promises.writeFile.mockRejectedValueOnce(writeError);

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Get container exists
          .mockResolvedValueOnce({ rows: [] }) // Update container
          .mockResolvedValueOnce({ rows: [{ workflow_json: {} }] }) // Get workflow
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: jest.fn()
      };

      pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/workflows/1/assign/abcdef123456')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('write failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
