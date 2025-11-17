const request = require('supertest');
const express = require('express');

jest.mock('../../database');
jest.mock('../../middleware/auth', () => ({ authenticateApiKey: jest.fn() }));
jest.mock('../../middleware/rbac', () => ({ requireRole: jest.fn() }));

const { pool } = require('../../database');
const { authenticateApiKey } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
jest.mock('../../utils/logger');

authenticateApiKey.mockImplementation((req, res, next) => next());
requireRole.mockImplementation(() => (req, res, next) => next());

const poolsRoutes = require('../../routes/containerPools');

const app = express();
app.use(express.json());
app.use('/api/container-pools', poolsRoutes);

describe('Container pool load distribution route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns container load distribution and summary', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 1, name: 'a', port: 1, status: 'running', max_concurrent_jobs: 2, health_status: 'healthy', active_jobs: 1, load_percent: 50 },
        { id: 2, name: 'b', port: 2, status: 'running', max_concurrent_jobs: 4, health_status: 'busy', active_jobs: 2, load_percent: 50 }
      ]
    });

    const response = await request(app)
      .get('/api/container-pools/5/load-distribution')
      .expect(200);

    expect(pool.query).toHaveBeenCalled();
    expect(response.body.success).toBe(true);
    expect(response.body.data.containers).toHaveLength(2);
    expect(response.body.data.summary.total_active_jobs).toBe(3);
    expect(response.body.data.summary.average_load_percent).toBe('50.00');
  });
});
