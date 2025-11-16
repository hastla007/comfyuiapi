import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, Cpu, HardDrive, Activity, Server, Database, CheckCircle, XCircle } from 'lucide-react';
import { API_URL } from '../config';
import './SystemInfoPage.css';

function SystemInfoPage() {
  const [metrics, setMetrics] = useState({});
  const [health, setHealth] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSystemInfo();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchSystemInfo, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchSystemInfo = async () => {
    try {
      const [metricsRes, healthRes] = await Promise.all([
        axios.get(`${API_URL}/health/metrics/custom`),
        axios.get(`${API_URL}/health`)
      ]);

      if (metricsRes.data.success) {
        const newMetrics = metricsRes.data.metrics;
        setMetrics(newMetrics);
        setError('');

        // Update history for charts
        setHistory(prev => {
          const updated = [
            ...prev,
            {
              timestamp: new Date().toLocaleTimeString(),
              cpu: newMetrics.cpu?.usage || 0,
              memory: newMetrics.memory?.usagePercent || 0,
              disk: newMetrics.disk?.usagePercent || 0
            }
          ].slice(-20); // Keep last 20 entries
          return updated;
        });
      }

      if (healthRes.data.success) {
        setHealth(healthRes.data);
      }
    } catch (error) {
      console.error('Error fetching system info:', error);
      setError('Unable to load system information. Check API connectivity and CORS settings.');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes < 0) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getHealthStatus = (status) => {
    return status === 'healthy' ? (
      <span className="health-badge healthy">
        <CheckCircle size={16} /> Healthy
      </span>
    ) : (
      <span className="health-badge unhealthy">
        <XCircle size={16} /> Unhealthy
      </span>
    );
  };

  const getUsageClass = (percent) => {
    if (percent < 0) return 'unavailable';  // For unavailable metrics
    if (percent >= 90) return 'critical';
    if (percent >= 75) return 'warning';
    return 'normal';
  };

  const formatMetricValue = (value) => {
    if (value === null || value === undefined || value < 0) {
      return 'N/A';
    }
    return value.toFixed(1);
  };

  return (
    <div className="system-info-page">
      <div className="system-header">
        <h2>System Information & Metrics</h2>
        <div className="system-controls">
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={fetchSystemInfo} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading system info...</div>
      ) : (
        <>
          {error && <div className="error-banner">{error}</div>}
          {/* Docker Desktop Warning */}
          {metrics.system?.dockerDesktop && (
            <div className="docker-desktop-notice">
              <Activity size={20} />
              <div>
                <strong>Docker Desktop Detected</strong>
                <p>Some system metrics may be limited when running on Docker Desktop for Windows/Mac.
                   CPU and memory metrics reflect the container's view, not the host system.</p>
              </div>
            </div>
          )}

          {/* Health Status */}
          <div className="health-section">
            <h3>Service Health</h3>
            <div className="health-grid">
              <div className="health-card">
                <Server size={24} />
                <div>
                  <div className="health-label">API Server</div>
                  {getHealthStatus(health.status)}
                </div>
              </div>
              <div className="health-card">
                <Database size={24} />
                <div>
                  <div className="health-label">Database</div>
                  {getHealthStatus(health.database?.status)}
                </div>
              </div>
              <div className="health-card">
                <Activity size={24} />
                <div>
                  <div className="health-label">Docker</div>
                  {getHealthStatus(health.docker?.status)}
                </div>
              </div>
            </div>
          </div>

          {/* Resource Metrics */}
          <div className="metrics-section">
            <h3>Resource Usage</h3>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-header">
                  <Cpu size={24} className="metric-icon cpu" />
                  <div className="metric-title">CPU</div>
                </div>
                <div className={`metric-value ${getUsageClass(metrics.cpu?.usage ?? -1)}`}>
                  {formatMetricValue(metrics.cpu?.usage)}{metrics.cpu?.usage >= 0 ? '%' : ''}
                </div>
                <div className="metric-bar">
                  <div
                    className={`metric-fill ${getUsageClass(metrics.cpu?.usage ?? -1)}`}
                    style={{ width: `${Math.max(0, metrics.cpu?.usage || 0)}%` }}
                  />
                </div>
                <div className="metric-details">
                  <span>Cores: {metrics.cpu?.cores || 'N/A'}</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <Activity size={24} className="metric-icon memory" />
                  <div className="metric-title">Memory</div>
                </div>
                <div className={`metric-value ${getUsageClass(metrics.memory?.usagePercent ?? -1)}`}>
                  {formatMetricValue(metrics.memory?.usagePercent)}{metrics.memory?.usagePercent >= 0 ? '%' : ''}
                </div>
                <div className="metric-bar">
                  <div
                    className={`metric-fill ${getUsageClass(metrics.memory?.usagePercent ?? -1)}`}
                    style={{ width: `${Math.max(0, metrics.memory?.usagePercent || 0)}%` }}
                  />
                </div>
                <div className="metric-details">
                  <span>{formatBytes(metrics.memory?.used)} / {formatBytes(metrics.memory?.total)}</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <HardDrive size={24} className="metric-icon disk" />
                  <div className="metric-title">Disk</div>
                </div>
                <div className={`metric-value ${getUsageClass(metrics.disk?.usagePercent ?? -1)}`}>
                  {formatMetricValue(metrics.disk?.usagePercent)}{metrics.disk?.usagePercent >= 0 ? '%' : ''}
                </div>
                <div className="metric-bar">
                  <div
                    className={`metric-fill ${getUsageClass(metrics.disk?.usagePercent ?? -1)}`}
                    style={{ width: `${Math.max(0, metrics.disk?.usagePercent || 0)}%` }}
                  />
                </div>
                <div className="metric-details">
                  <span>{formatBytes(metrics.disk?.used)} / {formatBytes(metrics.disk?.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="charts-section">
            <h3>Resource History</h3>
            <div className="chart-container">
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cpu" stroke="#667eea" name="CPU %" />
                    <Line type="monotone" dataKey="memory" stroke="#764ba2" name="Memory %" />
                    <Line type="monotone" dataKey="disk" stroke="#ffc107" name="Disk %" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="no-data">No historical data yet</div>
              )}
            </div>
          </div>

          {/* System Info */}
          <div className="info-section">
            <h3>System Details</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Platform:</span>
                <span className="info-value">{metrics.system?.platform || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Node Version:</span>
                <span className="info-value">{metrics.system?.nodeVersion || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Uptime:</span>
                <span className="info-value">{formatUptime(metrics.system?.uptime)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Active Containers:</span>
                <span className="info-value">{health.docker?.containers || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Database Connections:</span>
                <span className="info-value">{health.database?.connections || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">API Version:</span>
                <span className="info-value">1.0.0</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SystemInfoPage;
