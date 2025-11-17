jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

jest.mock('../../database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn()
  }
}));

afterEach(() => {
  const { pool } = require('../../database');
  pool.query.mockReset();
});

describe('JobProcessor load-aware selection', () => {
  const jobProcessor = require('../../services/jobProcessor');
  const { pool } = require('../../database');

  beforeEach(() => {
    pool.query.mockReset();
  });

  it('selects the least-loaded healthy container', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 2, active_jobs: 1, max_concurrent_jobs: 3, health_status: 'healthy' }]
    });

    const container = await jobProcessor.selectContainer();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(container.id).toBe(2);
  });

  it('falls back to any running container when none have capacity', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'running' }] });

    const container = await jobProcessor.selectContainer();

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(container.id).toBe(5);
  });
});

describe('JobProcessor job tracking', () => {
  const jobProcessor = require('../../services/jobProcessor');
  const { pool } = require('../../database');

  beforeEach(() => {
    pool.query.mockReset();
  });

  it('records job start and completion', async () => {
    pool.query.mockResolvedValue({});

    await jobProcessor.trackJobStarted(10, 7);
    await jobProcessor.trackJobCompleted(10);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      `INSERT INTO container_active_jobs (container_id, job_id, status)
         VALUES ($1, $2, 'processing')
         ON CONFLICT (container_id, job_id) DO UPDATE SET status = 'processing', completed_at = NULL`,
      [7, 10]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE containers SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
      [7]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      `UPDATE container_active_jobs 
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE job_id = $1`,
      [10]
    );
  });
});
