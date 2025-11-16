const { Server } = require('socket.io');
const logger = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  /**
   * Initialize Socket.io server
   * @param {http.Server} server - HTTP server instance
   * @param {object} corsOptions - CORS configuration
   */
  initialize(server, corsOptions) {
    this.io = new Server(server, {
      cors: corsOptions,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      const userId = socket.handshake.auth.userId || 'anonymous';

      logger.info(`WebSocket client connected: ${clientId}`, { userId });

      this.connectedClients.set(clientId, {
        socket,
        userId,
        connectedAt: new Date(),
        subscriptions: new Set()
      });

      // Join user-specific room
      if (userId !== 'anonymous') {
        socket.join(`user:${userId}`);
      }

      // Handle client subscriptions
      socket.on('subscribe', (data) => {
        const { channel } = data;
        if (channel) {
          socket.join(channel);
          const client = this.connectedClients.get(clientId);
          if (client) {
            client.subscriptions.add(channel);
          }
          logger.debug(`Client ${clientId} subscribed to ${channel}`);
        }
      });

      socket.on('unsubscribe', (data) => {
        const { channel } = data;
        if (channel) {
          socket.leave(channel);
          const client = this.connectedClients.get(clientId);
          if (client) {
            client.subscriptions.delete(channel);
          }
          logger.debug(`Client ${clientId} unsubscribed from ${channel}`);
        }
      });

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${clientId}`);
        this.connectedClients.delete(clientId);
      });

      // Send initial connection success message
      socket.emit('connected', {
        clientId,
        serverTime: new Date().toISOString(),
        message: 'Successfully connected to real-time server'
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Broadcast job progress update
   * @param {string} jobId - Job ID
   * @param {object} data - Progress data
   */
  broadcastJobProgress(jobId, data) {
    if (!this.io) return;

    const payload = {
      jobId,
      progress: data.progress || 0,
      status: data.status,
      currentNode: data.currentNode,
      totalNodes: data.totalNodes,
      message: data.message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to job-specific channel
    this.io.to(`job:${jobId}`).emit('job:progress', payload);

    // Broadcast to user-specific channel if userId is available
    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('job:progress', payload);
    }

    logger.debug(`Broadcasted job progress for ${jobId}: ${data.progress}%`);
  }

  /**
   * Broadcast job completion
   * @param {string} jobId - Job ID
   * @param {object} data - Completion data
   */
  broadcastJobCompletion(jobId, data) {
    if (!this.io) return;

    const payload = {
      jobId,
      status: data.status,
      result: data.result,
      error: data.error,
      completedAt: new Date().toISOString()
    };

    // Broadcast to job-specific channel
    this.io.to(`job:${jobId}`).emit('job:completed', payload);

    // Broadcast to user-specific channel
    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('job:completed', payload);
    }

    // Send notification
    if (data.userId) {
      this.sendNotification(data.userId, {
        type: data.status === 'completed' ? 'success' : 'error',
        title: data.status === 'completed' ? 'Job Completed' : 'Job Failed',
        message: data.status === 'completed'
          ? `Job ${jobId} completed successfully`
          : `Job ${jobId} failed: ${data.error}`,
        jobId
      });
    }

    logger.info(`Broadcasted job completion for ${jobId}: ${data.status}`);
  }

  /**
   * Broadcast container status update
   * @param {string} containerId - Container ID
   * @param {object} data - Container status data
   */
  broadcastContainerStatus(containerId, data) {
    if (!this.io) return;

    const payload = {
      containerId,
      status: data.status,
      name: data.name,
      state: data.state,
      stats: data.stats,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all connected clients (containers are shared resources)
    this.io.emit('container:status', payload);

    logger.debug(`Broadcasted container status for ${containerId}: ${data.status}`);
  }

  /**
   * Stream log entry
   * @param {string} source - Log source (container ID, service name, etc.)
   * @param {object} logEntry - Log entry data
   */
  streamLog(source, logEntry) {
    if (!this.io) return;

    const payload = {
      source,
      level: logEntry.level,
      message: logEntry.message,
      timestamp: logEntry.timestamp || new Date().toISOString(),
      metadata: logEntry.metadata
    };

    // Broadcast to log channel
    this.io.to(`logs:${source}`).emit('log:entry', payload);

    logger.debug(`Streamed log for ${source}`);
  }

  /**
   * Send notification to user
   * @param {string} userId - User ID
   * @param {object} notification - Notification data
   */
  sendNotification(userId, notification) {
    if (!this.io) return;

    const payload = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: notification.type || 'info',
      title: notification.title,
      message: notification.message,
      data: notification.data,
      timestamp: new Date().toISOString(),
      read: false
    };

    // Send to specific user
    this.io.to(`user:${userId}`).emit('notification', payload);

    logger.info(`Sent notification to user ${userId}: ${notification.title}`);
  }

  /**
   * Broadcast system event
   * @param {string} eventType - Event type
   * @param {object} data - Event data
   */
  broadcastSystemEvent(eventType, data) {
    if (!this.io) return;

    const payload = {
      eventType,
      data,
      timestamp: new Date().toISOString()
    };

    this.io.emit('system:event', payload);

    logger.info(`Broadcasted system event: ${eventType}`);
  }

  /**
   * Get connected clients count
   * @returns {number} Number of connected clients
   */
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  /**
   * Get connected clients info
   * @returns {Array} Array of client information
   */
  getConnectedClientsInfo() {
    return Array.from(this.connectedClients.values()).map(client => ({
      userId: client.userId,
      connectedAt: client.connectedAt,
      subscriptions: Array.from(client.subscriptions)
    }));
  }

  /**
   * Disconnect all clients
   */
  disconnectAll() {
    if (!this.io) return;

    this.io.disconnectSockets();
    this.connectedClients.clear();
    logger.info('All WebSocket clients disconnected');
  }
}

// Export singleton instance
module.exports = new WebSocketService();
