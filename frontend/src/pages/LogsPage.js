import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { RefreshCw, Download, Trash2, Search } from 'lucide-react';
import { API_URL } from '../config';
import './LogsPage.css';

function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchLogs();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, levelFilter]);

  const fetchLogs = async () => {
    try {
      const response = await axios.get(`${API_URL}/health/logs`);
      if (response.data.success) {
        setLogs(response.data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = logs;

    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.timestamp?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const downloadLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${new Date().toISOString()}.json`;
    link.click();
  };

  const clearLogs = async () => {
    if (window.confirm('Are you sure you want to clear all logs?')) {
      try {
        await axios.delete(`${API_URL}/health/logs`);
        setLogs([]);
      } catch (error) {
        console.error('Error clearing logs:', error);
        alert('Failed to clear logs');
      }
    }
  };

  const getLogLevelClass = (level) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return 'log-error';
      case 'warn':
        return 'log-warn';
      case 'info':
        return 'log-info';
      case 'debug':
        return 'log-debug';
      default:
        return '';
    }
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <h2>System Logs</h2>
        <div className="logs-controls">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="level-filter"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>

          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>

          <button onClick={fetchLogs} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>

          <button onClick={scrollToBottom} className="btn-icon" title="Scroll to bottom">
            ↓
          </button>

          <button onClick={downloadLogs} className="btn-icon" title="Download logs">
            <Download size={18} />
          </button>

          <button onClick={clearLogs} className="btn-icon btn-danger" title="Clear logs">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="logs-container">
        {loading ? (
          <div className="loading">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="no-logs">No logs found</div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log, index) => (
              <div key={index} className={`log-entry ${getLogLevelClass(log.level)}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-level">[{log.level?.toUpperCase()}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      <div className="logs-footer">
        <span>Total: {logs.length} logs</span>
        <span>Filtered: {filteredLogs.length} logs</span>
      </div>
    </div>
  );
}

export default LogsPage;
