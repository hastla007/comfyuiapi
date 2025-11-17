jest.mock('../../services/websocketService', () => ({
  broadcastContainerStatus: jest.fn()
}));

jest.mock('../../database', () => ({
  pool: {
    query: jest.fn()
  }
}));

jest.mock('../../docker', () => ({
  getContainer: jest.fn()
}));

const websocketService = require('../../services/websocketService');
const { pool } = require('../../database');
const { getContainer } = require('../../docker');
const monitor = require('../../services/containerMonitor');

describe('ContainerMonitor', () => {
  beforeEach(() => {
    monitor.containerStates.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses container_id field when inspecting containers', async () => {
    const dbContainer = {
      id: 1,
      container_id: 'abc123',
      name: 'container-one',
      port: 8188
    };

    const inspectMock = jest.fn().mockResolvedValue({
      State: {
        Running: true,
        Health: { Status: 'healthy' },
        StartedAt: '2024-01-01T00:00:00Z',
        FinishedAt: null,
        ExitCode: 0,
        Pid: 123
      }
    });

    const statsMock = jest.fn().mockResolvedValue({
      cpu_stats: {
        cpu_usage: { total_usage: 2 },
        system_cpu_usage: 4,
        online_cpus: 1
      },
      precpu_stats: {
        cpu_usage: { total_usage: 1 },
        system_cpu_usage: 2
      },
      memory_stats: { usage: 512, limit: 1024 },
      networks: { eth0: { rx_bytes: 100, tx_bytes: 200 } }
    });

    getContainer.mockReturnValue({ inspect: inspectMock, stats: statsMock });
    pool.query.mockResolvedValue({ rows: [] });

    await monitor.checkContainer(dbContainer);

    expect(getContainer).toHaveBeenCalledWith('abc123');
    expect(inspectMock).toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE containers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['running', 1]
    );
    expect(websocketService.broadcastContainerStatus).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'running',
      name: 'container-one',
      port: 8188
    }));
  });
});
