const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Get all ComfyUI containers
 */
async function getAllContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.filter(c => c.Names.some(name => name.includes('comfyui-instance')));
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
  const { name, port, workflowPath, instanceId } = config;

  const containerConfig = {
    Image: 'comfyuiapi-comfyui:latest',
    name: `comfyui-instance-${instanceId}`,
    ExposedPorts: {
      '8188/tcp': {}
    },
    HostConfig: {
      PortBindings: {
        '8188/tcp': [{ HostPort: String(port) }]
      },
      Binds: [
        `${process.cwd()}/models:/app/models`,
        `${process.cwd()}/workflows/instance-${instanceId}:/app/workflows`,
        `${process.cwd()}/output:/app/output`
      ],
      DeviceRequests: [
        {
          Driver: 'nvidia',
          Count: -1,
          Capabilities: [['gpu']]
        }
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
        'comfyuiapi_comfyui-network': {}
      }
    }
  };

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
  await container.stop();
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
  await container.remove({ force });
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
