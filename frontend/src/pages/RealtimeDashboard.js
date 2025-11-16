import React, { useState, useEffect } from 'react';
import websocketClient from '../services/websocketClient';

const RealtimeDashboard = () => {
  const [connected, setConnected] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [containers, setContainers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Connect to WebSocket
    const connectWebSocket = async () => {
      try {
        await websocketClient.connect(process.env.REACT_APP_WS_URL || 'http://localhost:3000');
        setConnected(true);

        // Subscribe to all events
        websocketClient.subscribe('jobs');
        websocketClient.subscribe('containers');
        websocketClient.subscribe('logs');
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
      }
    };

    connectWebSocket();

    // Set up event listeners
    websocketClient.on('connection', (data) => {
      setConnected(data.status === 'connected');
    });

    websocketClient.on('job:progress', (data) => {
      setJobs(prev => {
        const index = prev.findIndex(j => j.jobId === data.jobId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    websocketClient.on('job:completed', (data) => {
      setJobs(prev => {
        const index = prev.findIndex(j => j.jobId === data.jobId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return prev;
      });
    });

    websocketClient.on('container:status', (data) => {
      setContainers(prev => {
        const index = prev.findIndex(c => c.containerId === data.containerId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    websocketClient.on('notification', (data) => {
      setNotifications(prev => [data, ...prev].slice(0, 50));
    });

    websocketClient.on('log:entry', (data) => {
      setLogs(prev => [data, ...prev].slice(0, 100));
    });

    // Cleanup
    return () => {
      websocketClient.disconnect();
    };
  }, []);

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h1 style={{ margin: 0 }}>Real-Time Dashboard</h1>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: connected ? '#4caf50' : '#f44336',
          boxShadow: connected ? '0 0 8px #4caf50' : '0 0 8px #f44336'
        }} />
        <span style={{ fontSize: '14px', color: '#666' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {/* Job Progress */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '2px solid #2196f3', paddingBottom: '10px' }}>
            Live Jobs ({jobs.length})
          </h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {jobs.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>No active jobs</p>
            ) : (
              jobs.map((job, idx) => (
                <div key={idx} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Job {job.jobId?.substring(0, 8)}</span>
                    <span style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: job.status === 'completed' ? '#4caf50' : job.status === 'failed' ? '#f44336' : '#ff9800',
                      color: 'white'
                    }}>
                      {job.status}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${job.progress || 0}%`,
                      height: '100%',
                      backgroundColor: job.status === 'failed' ? '#f44336' : '#2196f3',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '5px', color: '#666' }}>
                    Progress: {job.progress || 0}%
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Container Status */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '2px solid #4caf50', paddingBottom: '10px' }}>
            Containers ({containers.length})
          </h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {containers.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>No containers</p>
            ) : (
              containers.map((container, idx) => (
                <div key={idx} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{container.name}</span>
                    <span style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: container.status === 'running' ? '#4caf50' : '#f44336',
                      color: 'white'
                    }}>
                      {container.status}
                    </span>
                  </div>
                  {container.stats && (
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      <div>CPU: {container.stats.cpu?.percent}%</div>
                      <div>Memory: {container.stats.memory?.usageMB}MB / {container.stats.memory?.limitMB}MB</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notifications */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '2px solid #ff9800', paddingBottom: '10px' }}>
            Notifications ({notifications.length})
          </h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>No notifications</p>
            ) : (
              notifications.map((notif, idx) => (
                <div key={idx} style={{
                  marginBottom: '10px',
                  padding: '10px',
                  backgroundColor: notif.type === 'error' ? '#ffebee' : '#e3f2fd',
                  borderRadius: '4px',
                  borderLeft: `4px solid ${notif.type === 'error' ? '#f44336' : '#2196f3'}`
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' }}>{notif.title}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{notif.message}</div>
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '3px' }}>
                    {new Date(notif.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Logs */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>
            Live Logs ({logs.length})
          </h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
            {logs.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>No logs</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} style={{
                  marginBottom: '5px',
                  padding: '5px',
                  backgroundColor: log.level === 'error' ? '#ffebee' : '#f9f9f9',
                  borderRadius: '2px'
                }}>
                  <span style={{ color: '#999' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {' '}
                  <span style={{
                    color: log.level === 'error' ? '#f44336' : log.level === 'warn' ? '#ff9800' : '#666',
                    fontWeight: 'bold'
                  }}>
                    [{log.level?.toUpperCase()}]
                  </span>
                  {' '}
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealtimeDashboard;
