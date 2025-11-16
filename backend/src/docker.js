const Docker = require('dockerode');

// Use DOCKER_HOST environment variable if available, otherwise default to unix socket
let dockerConfig;

if (process.env.DOCKER_HOST) {
  // Validate DOCKER_HOST format (should be tcp://host:port or unix:///path/to/socket)
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost.startsWith('tcp://')) {
    const match = dockerHost.match(/^tcp:\/\/([^:]+):(\d+)$/);
    if (!match) {
      console.error('Invalid DOCKER_HOST format. Expected tcp://host:port');
      process.exit(1);
    }
    dockerConfig = {
      host: match[1],
      port: parseInt(match[2], 10)
    };
  } else if (dockerHost.startsWith('unix://')) {
    dockerConfig = { socketPath: dockerHost.replace('unix://', '') };
  } else {
    // Assume it's just a host
    dockerConfig = { host: dockerHost };
  }
} else {
  dockerConfig = { socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' };
}

const docker = new Docker(dockerConfig);

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
  try {
    await container.start();
    return await container.inspect();
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
}

/**
 * Stop a container
 */
async function stopContainer(containerId) {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 10 });
    return await container.inspect();
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
}

/**
 * Restart a container
 */
async function restartContainer(containerId) {
  const container = docker.getContainer(containerId);
  try {
    await container.restart();
    return await container.inspect();
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
}

/**
 * Remove a container
 */
async function removeContainer(containerId, force = false) {
  const container = docker.getContainer(containerId);
  try {
    await container.remove({ force, v: true });
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
}

/**
 * Get container logs
 */
async function getContainerLogs(containerId, tail = 100) {
  const container = docker.getContainer(containerId);
  try {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail
    });
    return logs.toString('utf8');
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
}

/**
 * Get container stats
 */
async function getContainerStats(containerId) {
  const container = docker.getContainer(containerId);
  try {
    // Inspect to verify container exists
    await container.inspect();
    const stats = await container.stats({ stream: false });
    return stats;
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }
    throw error;
  }
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
