const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Test Docker connection
 */
async function testDockerConnection() {
  try {
    await docker.ping();
    console.log('Docker connection successful');
    return true;
  } catch (error) {
    console.error('Cannot connect to Docker:', error.message);
    console.error('Please ensure Docker is running and the socket is accessible');
    return false;
  }
}

/**
 * Get all ComfyUI containers
 */
async function getAllContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.filter(c => c.Names && c.Names.some(name => name.includes('comfyui-instance')));
}

/**
 * Get container by ID
 */
async function getContainer(containerId) {
  return docker.getContainer(containerId);
}

/**
 * Create a new ComfyUI container
 */
async function createContainer(config) {
  const { name, port, workflowPath, instanceId, enableGpu = true } = config;

  // Use environment variable for volume base path, fallback to /app for production
  const volumeBase = process.env.VOLUME_BASE || '/app';

  const containerConfig = {
    Image: process.env.COMFYUI_IMAGE || 'comfyuiapi-comfyui:latest',
    name: `comfyui-instance-${instanceId}`,
    ExposedPorts: {
      '8188/tcp': {}
    },
    HostConfig: {
      PortBindings: {
        '8188/tcp': [{ HostPort: String(port) }]
      },
      Binds: [
        `${volumeBase}/models:/app/models`,
        `${volumeBase}/workflows/instance-${instanceId}:/app/workflows`,
        `${volumeBase}/output:/app/output`
      ],
      RestartPolicy: {
        Name: 'unless-stopped'
      }
    },
    Env: [
      `INSTANCE_ID=${instanceId}`,
      'NVIDIA_VISIBLE_DEVICES=all'
    ],
    NetworkingConfig: {
      EndpointsConfig: {
        'comfyui-network': {}
      }
    }
  };

  // Only add GPU device requests if enabled
  if (enableGpu) {
    containerConfig.HostConfig.DeviceRequests = [
      {
        Driver: 'nvidia',
        Count: -1,
        Capabilities: [['gpu']]
      }
    ];
  }

  const container = await docker.createContainer(containerConfig);
  return container;
}

/**
 * Start a container
 */
async function startContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.start();
  return await container.inspect();
}

/**
 * Stop a container
 */
async function stopContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.stop({ t: 10 });
  return await container.inspect();
}

/**
 * Restart a container
 */
async function restartContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.restart();
  return await container.inspect();
}

/**
 * Remove a container
 */
async function removeContainer(containerId, force = false) {
  const container = docker.getContainer(containerId);
  await container.remove({ force, v: true });
}

/**
 * Get container logs
 */
async function getContainerLogs(containerId, tail = 100) {
  const container = docker.getContainer(containerId);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail
  });
  return logs.toString('utf8');
}

/**
 * Get container stats
 */
async function getContainerStats(containerId) {
  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  return stats;
}

module.exports = {
  docker,
  testDockerConnection,
  getAllContainers,
  getContainer,
  createContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  getContainerStats
};
