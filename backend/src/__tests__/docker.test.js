jest.mock('dockerode');
const Docker = require('dockerode');

describe('docker volume base resolution', () => {
  const mockCreateContainer = jest.fn();
  const mockListNetworks = jest.fn();
  const mockGetImage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOLUME_BASE = '';
    process.env.COMPOSE_PROJECT_DIR = '/host/project';
    process.env.SKIP_DOCKER_IMAGE_CHECK = 'true';
    process.env.SKIP_DOCKER_NETWORK_CHECK = 'true';

    Docker.mockClear();
    Docker.mockImplementation(() => ({
      listNetworks: mockListNetworks,
      createNetwork: jest.fn(),
      getImage: mockGetImage,
      createContainer: mockCreateContainer
    }));

    mockListNetworks.mockResolvedValue([{ Name: 'comfyui-network' }]);
    mockGetImage.mockImplementation(() => ({ inspect: jest.fn().mockResolvedValue({}) }));
    mockCreateContainer.mockResolvedValue({ id: 'abc123' });
  });

  it('uses COMPOSE_PROJECT_DIR when VOLUME_BASE is not provided', async () => {
    let createContainer;
    jest.isolateModules(() => {
      ({ createContainer } = require('../docker'));
    });

    await createContainer({
      name: 'test',
      port: 9000,
      instanceId: 5,
      workflowPath: '/app/workflows/instance-5',
      enableGpu: false
    });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: expect.arrayContaining([
            '/host/project/models:/app/models',
            '/host/project/workflows/instance-5:/app/workflows',
            '/host/project/output:/app/output'
          ])
        })
      })
    );
  });
});
