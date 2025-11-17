import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { API_URL } from '../config';
import './SettingsPage.css';

function SettingsPage() {
  const [settings, setSettings] = useState({
    maxConcurrentJobs: 5,
    jobTimeout: 3600,
    enableWebhooks: false,
    webhookUrl: '',
    logLevel: 'info',
    autoCleanupDays: 7,
    enableMetrics: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings`);
      if (response.data.success) {
        setSettings({ ...settings, ...response.data.settings });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings({ ...settings, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const response = await axios.put(`${API_URL}/settings`, settings);
      if (response.data.success) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Settings</h2>
        <button onClick={fetchSettings} className="btn-icon" title="Refresh">
          <RefreshCw size={18} />
        </button>
      </div>

      {message && (
        <div className={`message ${message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="settings-form">
        <div className="settings-section">
          <h3>Job Processing</h3>
          <div className="form-group">
            <label htmlFor="maxConcurrentJobs">Max Concurrent Jobs</label>
            <input
              id="maxConcurrentJobs"
              type="number"
              min="1"
              max="20"
              value={settings.maxConcurrentJobs}
              onChange={(e) => handleChange('maxConcurrentJobs', parseInt(e.target.value))}
            />
            <small>Maximum number of jobs that can run simultaneously</small>
          </div>

          <div className="form-group">
            <label htmlFor="jobTimeout">Job Timeout (seconds)</label>
            <input
              id="jobTimeout"
              type="number"
              min="60"
              max="86400"
              value={settings.jobTimeout}
              onChange={(e) => handleChange('jobTimeout', parseInt(e.target.value))}
            />
            <small>Maximum time a job can run before being terminated</small>
          </div>
        </div>

        <div className="settings-section">
          <h3>Webhooks</h3>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.enableWebhooks}
                onChange={(e) => handleChange('enableWebhooks', e.target.checked)}
              />
              Enable Webhooks
            </label>
            <small>Send job status updates to external services</small>
          </div>

          {settings.enableWebhooks && (
            <div className="form-group">
              <label htmlFor="webhookUrl">Webhook URL</label>
              <input
                id="webhookUrl"
                type="url"
                value={settings.webhookUrl}
                onChange={(e) => handleChange('webhookUrl', e.target.value)}
                placeholder="https://example.com/webhook"
              />
              <small>URL to receive webhook notifications</small>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Logging & Monitoring</h3>
          <div className="form-group">
            <label htmlFor="logLevel">Log Level</label>
            <select
              id="logLevel"
              value={settings.logLevel}
              onChange={(e) => handleChange('logLevel', e.target.value)}
            >
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
            <small>Minimum log level to record</small>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.enableMetrics}
                onChange={(e) => handleChange('enableMetrics', e.target.checked)}
              />
              Enable Metrics Collection
            </label>
            <small>Collect and expose Prometheus metrics</small>
          </div>
        </div>

        <div className="settings-section">
          <h3>Maintenance</h3>
          <div className="form-group">
            <label htmlFor="autoCleanupDays">Auto-cleanup Days</label>
            <input
              id="autoCleanupDays"
              type="number"
              min="1"
              max="365"
              value={settings.autoCleanupDays}
              onChange={(e) => handleChange('autoCleanupDays', parseInt(e.target.value))}
            />
            <small>Delete completed jobs and logs older than specified days</small>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn-save">
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
