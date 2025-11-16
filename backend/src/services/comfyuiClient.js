const axios = require('axios');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

/**
 * ComfyUI API Client
 * Handles communication with ComfyUI instances via HTTP and WebSocket
 */
class ComfyUIClient extends EventEmitter {
  constructor(baseUrl) {
    super();
    this.baseUrl = baseUrl;
    this.ws = null;
    this.clientId = this.generateClientId();
    this.activePrompts = new Map(); // promptId -> callback
  }

  /**
   * Generate a unique client ID for WebSocket connection
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Connect to ComfyUI WebSocket for real-time updates
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl.replace('http', 'ws')}/ws?clientId=${this.clientId}`;

      this.ws = new WebSocket(wsUrl);
      this.reconnectAttempts = this.reconnectAttempts || 0;
      this.maxReconnectAttempts = 10;

      this.ws.on('open', () => {
        console.log(`WebSocket connected to ${wsUrl}`);
        this.reconnectAttempts = 0; // Reset on successful connection
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.emit('disconnected');

        // Auto-reconnect with exponential backoff, but limit attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const backoffDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Max 30s
          console.log(`Reconnecting in ${backoffDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connectWebSocket(), backoffDelay);
        } else {
          console.error('Max reconnection attempts reached. Will not reconnect.');
          this.emit('max_reconnect_attempts_reached');
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'status':
        this.emit('status', data);
        break;

      case 'progress':
        // Progress update: { value, max, prompt_id }
        this.emit('progress', {
          promptId: data.prompt_id,
          value: data.value,
          max: data.max,
          percentage: Math.round((data.value / data.max) * 100)
        });
        break;

      case 'executing':
        // Node execution: { node, prompt_id }
        if (data.node === null) {
          // Execution finished
          this.emit('execution_complete', { promptId: data.prompt_id });
        } else {
          this.emit('executing_node', {
            promptId: data.prompt_id,
            node: data.node
          });
        }
        break;

      case 'executed':
        // Node completed with outputs
        this.emit('node_executed', {
          promptId: data.prompt_id,
          node: data.node,
          output: data.output
        });
        break;

      case 'execution_error':
        this.emit('execution_error', {
          promptId: data.prompt_id,
          node: data.node_id,
          error: data.exception_message,
          traceback: data.traceback
        });
        break;

      case 'execution_cached':
        this.emit('execution_cached', {
          promptId: data.prompt_id,
          nodes: data.nodes
        });
        break;

      default:
        console.log('Unknown message type:', type, data);
    }
  }

  /**
   * Queue a prompt for execution
   * @param {Object} workflow - The workflow JSON
   * @param {Object} parameters - Parameters to substitute in the workflow
   * @returns {Promise<string>} - The prompt ID
   */
  async queuePrompt(workflow, parameters = {}) {
    try {
      // Substitute parameters in workflow
      const processedWorkflow = this.substituteParameters(workflow, parameters);

      // Queue the prompt
      const response = await axios.post(`${this.baseUrl}/prompt`, {
        prompt: processedWorkflow,
        client_id: this.clientId
      });

      if (!response.data || !response.data.prompt_id) {
        throw new Error('Invalid response from ComfyUI: missing prompt_id');
      }

      return response.data.prompt_id;
    } catch (error) {
      console.error('Error queueing prompt:', error.message);
      throw new Error(`Failed to queue prompt: ${error.message}`);
    }
  }

  /**
   * Substitute parameters in workflow JSON
   * Replaces {{parameter}} placeholders with actual values
   */
  substituteParameters(workflow, parameters) {
    // Handle seed randomization
    if (!parameters.seed || parameters.seed === -1) {
      parameters.seed = Math.floor(Math.random() * 1000000000000);
    }

    // Deep clone the workflow
    const workflowCopy = JSON.parse(JSON.stringify(workflow));

    // Recursively substitute parameters
    const substitute = (obj) => {
      if (typeof obj === 'string') {
        // Replace {{param}} with value
        return obj.replace(/\{\{(\w+)\}\}/g, (match, key) => {
          return parameters[key] !== undefined ? parameters[key] : match;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(item => substitute(item));
      } else if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = substitute(value);
        }
        return result;
      }
      return obj;
    };

    return substitute(workflowCopy);
  }

  /**
   * Get the current queue status
   */
  async getQueue() {
    try {
      const response = await axios.get(`${this.baseUrl}/queue`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get queue: ${error.message}`);
    }
  }

  /**
   * Get history for a specific prompt
   */
  async getHistory(promptId) {
    try {
      const response = await axios.get(`${this.baseUrl}/history/${promptId}`);
      return response.data[promptId] || null;
    } catch (error) {
      throw new Error(`Failed to get history: ${error.message}`);
    }
  }

  /**
   * Cancel a prompt
   */
  async cancelPrompt(promptId) {
    try {
      await axios.post(`${this.baseUrl}/interrupt`);
      return true;
    } catch (error) {
      throw new Error(`Failed to cancel prompt: ${error.message}`);
    }
  }

  /**
   * Get output images from a completed prompt
   */
  async getOutputImages(promptId) {
    try {
      const history = await this.getHistory(promptId);

      if (!history || !history.outputs) {
        return [];
      }

      const images = [];

      // Extract images from all output nodes
      for (const [nodeId, nodeOutput] of Object.entries(history.outputs)) {
        if (nodeOutput.images) {
          for (const image of nodeOutput.images) {
            images.push({
              filename: image.filename,
              subfolder: image.subfolder || '',
              type: image.type || 'output',
              url: this.getImageUrl(image.filename, image.subfolder, image.type)
            });
          }
        }
      }

      return images;
    } catch (error) {
      throw new Error(`Failed to get output images: ${error.message}`);
    }
  }

  /**
   * Get the URL for an image
   */
  getImageUrl(filename, subfolder = '', type = 'output') {
    const params = new URLSearchParams({ filename, type });
    if (subfolder) {
      params.append('subfolder', subfolder);
    }
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  /**
   * Download an image as a buffer
   */
  async downloadImage(filename, subfolder = '', type = 'output') {
    try {
      const url = this.getImageUrl(filename, subfolder, type);
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  /**
   * Check if ComfyUI is reachable
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/system_stats`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get system stats from ComfyUI
   */
  async getSystemStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/system_stats`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get system stats: ${error.message}`);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Create a ComfyUI client for a specific container
 */
function createClient(containerPort) {
  const baseUrl = `http://localhost:${containerPort}`;
  return new ComfyUIClient(baseUrl);
}

module.exports = { ComfyUIClient, createClient };
