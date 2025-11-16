import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw, Pause, Play, Trash2, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import { API_URL } from '../config';
import './QueuePage.css';

function QueuePage() {
  const [queueItems, setQueueItems] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchQueue();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchQueue, 2000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchQueue = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs/queue`);
      if (response.data.success) {
        setQueueItems(response.data.queue || []);
        setStats(response.data.stats || {});
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (jobId) => {
    if (window.confirm('Are you sure you want to cancel this job?')) {
      try {
        await axios.post(`${API_URL}/jobs/${jobId}/cancel`);
        fetchQueue();
      } catch (error) {
        console.error('Error canceling job:', error);
        alert('Failed to cancel job');
      }
    }
  };

  const retryJob = async (jobId) => {
    try {
      await axios.post(`${API_URL}/jobs/${jobId}/retry`);
      fetchQueue();
    } catch (error) {
      console.error('Error retrying job:', error);
      alert('Failed to retry job');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock size={18} className="icon-pending" />;
      case 'processing':
        return <Loader size={18} className="icon-processing rotating" />;
      case 'completed':
        return <CheckCircle size={18} className="icon-completed" />;
      case 'failed':
        return <XCircle size={18} className="icon-failed" />;
      default:
        return null;
    }
  };

  const getStatusClass = (status) => {
    return `status-${status}`;
  };

  return (
    <div className="queue-page">
      <div className="queue-header">
        <h2>Job Queue</h2>
        <div className="queue-controls">
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={fetchQueue} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="queue-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.pending || 0}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.processing || 0}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completed || 0}</div>
          <div className="stat-label">Completed Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.failed || 0}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading queue...</div>
      ) : queueItems.length === 0 ? (
        <div className="empty-queue">
          <CheckCircle size={48} />
          <p>Queue is empty</p>
        </div>
      ) : (
        <div className="queue-list">
          {queueItems.map((item) => (
            <div key={item.id} className={`queue-item ${getStatusClass(item.status)}`}>
              <div className="item-header">
                <div className="item-status">
                  {getStatusIcon(item.status)}
                  <span className="status-text">{item.status}</span>
                </div>
                <div className="item-id">Job #{item.id}</div>
              </div>

              <div className="item-body">
                <div className="item-info">
                  <div className="info-row">
                    <span className="info-label">Workflow:</span>
                    <span className="info-value">{item.workflow_name || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Container:</span>
                    <span className="info-value">{item.container_name || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Priority:</span>
                    <span className="info-value">{item.priority || 5}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Created:</span>
                    <span className="info-value">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  {item.started_at && (
                    <div className="info-row">
                      <span className="info-label">Started:</span>
                      <span className="info-value">
                        {new Date(item.started_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {item.progress !== undefined && item.progress !== null && (
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{item.progress}%</span>
                  </div>
                )}
              </div>

              <div className="item-actions">
                {item.status === 'failed' && (
                  <button onClick={() => retryJob(item.id)} className="btn-action btn-retry">
                    <Play size={16} /> Retry
                  </button>
                )}
                {(item.status === 'pending' || item.status === 'processing') && (
                  <button onClick={() => cancelJob(item.id)} className="btn-action btn-cancel">
                    <Trash2 size={16} /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default QueuePage;
