/**
 * WebSocket Client Service for Real-Time Updates
 */

class WebSocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000;
    this.listeners = new Map();
  }

  /**
   * Connect to WebSocket server
   * @param {string} url - WebSocket server URL
   * @param {object} auth - Authentication data
   */
  async connect(url = 'http://localhost:3000', auth = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Dynamically import socket.io-client
        import('socket.io-client').then((io) => {
          this.socket = io.default(url, {
            transports: ['websocket', 'polling'],
            auth: auth,
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay
          });

          this.socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connection', { status: 'connected' });
            resolve();
          });

          this.socket.on('disconnect', (reason) => {
            console.log('❌ WebSocket disconnected:', reason);
            this.isConnected = false;
            this.emit('connection', { status: 'disconnected', reason });
          });

          this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.reconnectAttempts++;
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              reject(new Error('Max reconnection attempts reached'));
            }
          });

          // Handle incoming events
          this.socket.on('job:progress', (data) => this.emit('job:progress', data));
          this.socket.on('job:completed', (data) => this.emit('job:completed', data));
          this.socket.on('container:status', (data) => this.emit('container:status', data));
          this.socket.on('log:entry', (data) => this.emit('log:entry', data));
          this.socket.on('notification', (data) => this.emit('notification', data));
          this.socket.on('system:event', (data) => this.emit('system:event', data));
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name
   */
  subscribe(channel) {
    if (this.socket && this.isConnected) {
      this.socket.emit('subscribe', { channel });
    }
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channel - Channel name
   */
  unsubscribe(channel) {
    if (this.socket && this.isConnected) {
      this.socket.emit('unsubscribe', { channel });
    }
  }

  /**
   * Register event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }
}

export default new WebSocketClient();
