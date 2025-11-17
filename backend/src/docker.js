const Docker = require('dockerode');
const path = require('path');

function getVolumeBase() {
  const envBase = process.env.VOLUME_BASE || process.env.COMPOSE_PROJECT_DIR;

  if (envBase) {
    return envBase;
  }

  // Fallback to repository root instead of /app to avoid self-mounting inside containers
  return path.resolve(__dirname, '..', '..');
}

const volumeBase = process.env.VOLUME_BASE || process.env.COMPOSE_PROJECT_DIR || '/app';

function getVolumeBase() {
  return volumeBase;
}

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
 * Ensure ComfyUI network exists
 */
async function ensureNetwork() {
  const networkName = 'comfyui-network';
  if (process.env.SKIP_DOCKER_NETWORK_CHECK === 'true') {
    return true;
  }
  try {
    // Check if network exists
    const networks = await docker.listNetworks({
      filters: { name: [networkName] }
    });

    if (networks.length === 0) {
      console.log(`Creating Docker network: ${networkName}`);
      await docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        CheckDuplicate: true
      });
      console.log(`Docker network ${networkName} created successfully`);
    } else {
      console.log(`Docker network ${networkName} already exists`);
    }
    return true;
  } catch (error) {
    console.error(`Error ensuring network ${networkName}:`, error.message);
    throw new Error(`Failed to ensure Docker network: ${error.message}`);
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
function getContainer(containerId) {
  return docker.getContainer(containerId);
}

/**
 * Check if Docker image exists
 */
async function ensureImage(imageName) {
  if (process.env.SKIP_DOCKER_IMAGE_CHECK === 'true') {
    return true;
  }

  try {
    await docker.getImage(imageName).inspect();
    console.log(`Docker image ${imageName} found`);
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error(`Docker image ${imageName} not found. Please build or pull the image first.`);
    }
    throw new Error(`Failed to check Docker image: ${error.message}`);
  }
}

/**
 * Create a new ComfyUI container
 */
async function createContainer(config) {
  const { name, port, workflowPath, instanceId, enableGpu } = config;

  const gpuEnabled = enableGpu !== undefined ? enableGpu : process.env.ENABLE_GPU !== 'false';

  // Validate required configuration
  if (!instanceId || !port) {
    throw new Error('instanceId and port are required for container creation');
  }

  const imageName = process.env.COMFYUI_IMAGE || 'comfyuiapi-comfyui:latest';

  // Ensure image exists before creating container
  await ensureImage(imageName);

  // Ensure network exists before creating container
  await ensureNetwork();

  const volumeBase = getVolumeBase();

  const containerConfig = {
    Image: imageName,
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
  if (gpuEnabled) {
    containerConfig.HostConfig.DeviceRequests = [
      {
        Driver: 'nvidia',
        Count: -1,
        Capabilities: [['gpu']]
      }
    ];
  }

  try {
    console.log(`Creating container: comfyui-instance-${instanceId} on port ${port}`);
    const container = await docker.createContainer(containerConfig);

    // Verify container was created and has an ID
    if (!container || !container.id) {
      throw new Error('Container creation returned invalid container object');
    }

    console.log(`Container created successfully with ID: ${container.id}`);
    return container;
  } catch (error) {
    console.error('Error creating container:', error);
    // Provide more specific error messages
    if (error.message && error.message.includes('port is already allocated')) {
      throw new Error(`Port ${port} is already in use by another container`);
    }
    if (error.message && error.message.includes('No such image')) {
      throw new Error(`Docker image ${imageName} not found`);
    }
    throw new Error(`Failed to create container: ${error.message}`);
  }
}

/**
 * Start a container
 */
async function startContainer(containerId) {
  if (!containerId) {
    throw new Error('Container ID is required');
  }

  const container = docker.getContainer(containerId);
  try {
    console.log(`Starting container ${containerId}`);
    await container.start();
    const info = await container.inspect();
    console.log(`Container ${containerId} started successfully`);
    return info;
  } catch (error) {
    console.error(`Error starting container ${containerId}:`, error.message);
    if (error.statusCode === 404) {
      throw new Error(`Container not found: ${containerId}`);
    }
    if (error.statusCode === 304) {
      // Container is already started
      console.log(`Container ${containerId} is already running`);
      return await container.inspect();
    }
    if (error.message && error.message.includes('OCI runtime create failed')) {
      throw new Error(`Failed to start container: ${error.message}. Check Docker logs for details.`);
    }
    throw new Error(`Failed to start container: ${error.message}`);
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
  ensureNetwork,
  ensureImage,
  getAllContainers,
  getContainer,
  createContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
  getContainerStats,
  getVolumeBase
};
