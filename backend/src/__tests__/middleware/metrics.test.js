const { getSystemMetrics, metricsMiddleware } = require('../../middleware/metrics');

describe('Metrics Middleware', () => {
  describe('getSystemMetrics', () => {
    it('should return system metrics object', () => {
      const metrics = getSystemMetrics();

      expect(metrics).toHaveProperty('cpu');
      expect(metrics.cpu).toHaveProperty('cores');
      expect(metrics.cpu).toHaveProperty('usage');

      expect(metrics).toHaveProperty('memory');
      expect(metrics.memory).toHaveProperty('total');
      expect(metrics.memory).toHaveProperty('used');
      expect(metrics.memory).toHaveProperty('free');
      expect(metrics.memory).toHaveProperty('usagePercent');

      expect(metrics).toHaveProperty('system');
      expect(metrics.system).toHaveProperty('platform');
      expect(metrics.system).toHaveProperty('uptime');
      expect(metrics.system).toHaveProperty('nodeVersion');
    });

    it('should return valid percentage values', () => {
      const metrics = getSystemMetrics();

      expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu.usage).toBeLessThanOrEqual(100);
      expect(metrics.memory.usagePercent).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('metricsMiddleware', () => {
    it('should track HTTP request metrics', (done) => {
      const req = {
        method: 'GET',
        path: '/test',
        route: { path: '/test' }
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10);
          }
        })
      };
      const next = jest.fn();

      metricsMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();

      setTimeout(() => {
        expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
        done();
      }, 20);
    });
  });
});
