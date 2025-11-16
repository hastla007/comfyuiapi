const { createJob, getNextQueuedJob } = require('../../services/jobService');
const { pool } = require('../../database');

// Mock the database
jest.mock('../../database');
jest.mock('../../services/webhookService');

describe('JobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    test('should create job with valid model', async () => {
      const mockJob = {
        job_id: 'test-uuid',
        model: 'wan-2.2-text-to-video-turbo',
        status: 'queued',
        created_at: new Date()
      };

      pool.query.mockResolvedValue({ rows: [mockJob] });

      const result = await createJob(
        1,
        'wan-2.2-text-to-video-turbo',
        { prompt: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.job_id).toBe('test-uuid');
      expect(result.model).toBe('wan-2.2-text-to-video-turbo');
    });

    test('should reject invalid model name', async () => {
      await expect(
        createJob(1, 'invalid-model', {})
      ).rejects.toThrow('Invalid model name');
    });

    test('should accept all valid model names', async () => {
      const validModels = [
        'wan-2.2-text-to-video-turbo',
        'wan-2.2-image-to-video-turbo',
        'wan-2.5-text-to-video',
        'wan-2.5-image-to-video',
        'infinitetalk',
        'infinitetalk-fast',
        'infinitetalk-multi',
        'infinitetalk-fast-multi',
        'infinitetalk-video-to-video',
        'infinitetalk-fast-video-to-video'
      ];

      pool.query.mockResolvedValue({
        rows: [{
          job_id: 'test',
          model: 'test',
          status: 'queued',
          created_at: new Date()
        }]
      });

      for (const model of validModels) {
        await expect(
          createJob(1, model, {})
        ).resolves.toBeTruthy();
      }
    });
  });

  describe('getNextQueuedJob', () => {
    test('should respect job priority', async () => {
      const mockJob = {
        job_id: 'high-priority-job',
        model: 'wan-2.2-text-to-video-turbo',
        request_payload: {},
        workflow_id: null,
        user_id: 1
      };

      pool.query.mockResolvedValue({ rows: [mockJob] });

      const result = await getNextQueuedJob();

      expect(result).toBeTruthy();
      expect(result.job_id).toBe('high-priority-job');

      // Verify the query includes priority ordering
      const queryCall = pool.query.mock.calls[0][0];
      expect(queryCall).toContain('priority DESC');
      expect(queryCall).toContain('created_at ASC');
    });

    test('should return null when no jobs available', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await getNextQueuedJob();

      expect(result).toBeNull();
    });
  });
});
