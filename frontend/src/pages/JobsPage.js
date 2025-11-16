import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw, Filter, Download, Search } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL } from '../config';
import './JobsPage.css';

function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('7'); // days

  useEffect(() => {
    fetchJobs();
  }, [dateRange]);

  useEffect(() => {
    filterJobs();
  }, [jobs, statusFilter, searchTerm]);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`, {
        params: { days: dateRange }
      });
      if (response.data.success) {
        setJobs(response.data.jobs || []);
        setStats(response.data.stats || {});
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterJobs = () => {
    let filtered = jobs;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(job => job.status === statusFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.workflow_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.container_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.id?.toString().includes(searchTerm)
      );
    }

    setFilteredJobs(filtered);
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Workflow', 'Container', 'Status', 'Created', 'Started', 'Completed', 'Duration'];
    const rows = filteredJobs.map(job => [
      job.id,
      job.workflow_name || 'N/A',
      job.container_name || 'N/A',
      job.status,
      job.created_at,
      job.started_at || 'N/A',
      job.completed_at || 'N/A',
      job.duration || 'N/A'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jobs-${new Date().toISOString()}.csv`;
    link.click();
  };

  const statusColors = {
    completed: '#4caf50',
    failed: '#dc3545',
    processing: '#0d6efd',
    pending: '#ffc107',
    cancelled: '#6c757d'
  };

  const pieData = Object.entries(stats.byStatus || {}).map(([key, value]) => ({
    name: key,
    value: value
  }));

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <h2>Jobs History & Analytics</h2>
        <div className="jobs-controls">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="date-range-select"
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button onClick={fetchJobs} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon total">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.total || 0}</div>
            <div className="stat-label">Total Jobs</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success">✓</div>
          <div className="stat-content">
            <div className="stat-value">{stats.completed || 0}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon failed">✗</div>
          <div className="stat-content">
            <div className="stat-value">{stats.failed || 0}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon rate">%</div>
          <div className="stat-content">
            <div className="stat-value">
              {stats.total ? ((stats.completed / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <div className="stat-label">Success Rate</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Job Status Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={statusColors[entry.name] || '#999'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No data available</div>
          )}
        </div>

        <div className="chart-card">
          <h3>Jobs Over Time</h3>
          {stats.timeline && stats.timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="completed" stroke="#4caf50" />
                <Line type="monotone" dataKey="failed" stroke="#dc3545" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No data available</div>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="jobs-table-section">
        <div className="table-header">
          <h3>Job History</h3>
          <div className="table-controls">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="status-filter"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={exportToCSV} className="btn-export">
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="no-jobs">No jobs found</div>
        ) : (
          <div className="table-container">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Workflow</th>
                  <th>Container</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Duration</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="job-id">#{job.id}</td>
                    <td>{job.workflow_name || 'N/A'}</td>
                    <td>{job.container_name || 'N/A'}</td>
                    <td>
                      <span className={`status-badge status-${job.status}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>{job.created_at ? format(new Date(job.created_at), 'MMM dd, HH:mm') : 'N/A'}</td>
                    <td>{job.duration || 'N/A'}</td>
                    <td>
                      {job.progress !== undefined && job.progress !== null && (
                        <div className="mini-progress">
                          <div
                            className="mini-progress-fill"
                            style={{ width: `${job.progress}%` }}
                          />
                          <span className="mini-progress-text">{job.progress}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="jobs-footer">
        <span>Showing {filteredJobs.length} of {jobs.length} jobs</span>
      </div>
    </div>
  );
}

export default JobsPage;
