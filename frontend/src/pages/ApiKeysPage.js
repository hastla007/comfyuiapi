import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import './ApiKeysPage.css';
import { extractErrorMessage } from '../utils/errorMessage';
import { KeyRound, Trash2, RefreshCw, Plus } from 'lucide-react';

function ApiKeysPage() {
  const [form, setForm] = useState({
    email: '',
    name: '',
    keyName: '',
    permissions: '',
    rateLimit: 100,
    expiresAt: ''
  });
  const [userId, setUserId] = useState('');
  const [keys, setKeys] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [message, setMessage] = useState('');
  const [createdKey, setCreatedKey] = useState(null);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createKey = async (event) => {
    event.preventDefault();
    setCreating(true);
    setMessage('');

    try {
      const response = await axios.post(`${API_URL}/admin/api-keys`, {
        email: form.email,
        name: form.name,
        keyName: form.keyName,
        permissions: form.permissions || null,
        rateLimit: form.rateLimit,
        expiresAt: form.expiresAt || null
      });

      setCreatedKey(response.data);
      setMessage('API key created. Copy it now—this is the only time it is shown.');

      if (response.data.user_id) {
        setUserId(String(response.data.user_id));
        fetchKeys(String(response.data.user_id));
      }
    } catch (error) {
      setMessage(extractErrorMessage(error) || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const fetchKeys = async (targetUserId = userId) => {
    if (!targetUserId) {
      setMessage('Enter a user ID to fetch API keys.');
      return;
    }

    setLoadingKeys(true);
    setMessage('');

    try {
      const response = await axios.get(`${API_URL}/admin/api-keys/${targetUserId}`);
      setKeys(response.data.api_keys || []);
    } catch (error) {
      const reason = extractErrorMessage(error) || 'Unknown error';
      setMessage(`Failed to load API keys: ${reason}`);
    } finally {
      setLoadingKeys(false);
    }
  };

  const revokeKey = async (keyId) => {
    try {
      await axios.delete(`${API_URL}/admin/api-keys/${keyId}`);
      setKeys(prev => prev.filter(key => key.id !== keyId));
    } catch (error) {
      setMessage(extractErrorMessage(error) || 'Failed to revoke API key');
    }
  };

  return (
    <div className="api-keys-page">
      <div className="api-keys-header">
        <div className="title">
          <KeyRound size={24} />
          <div>
            <h2>API Keys</h2>
            <p>Create and manage API keys for authenticated access.</p>
          </div>
        </div>
        <button className="btn" onClick={() => fetchKeys()} disabled={loadingKeys}>
          <RefreshCw size={16} /> Refresh Keys
        </button>
      </div>

      {message && <div className="message">{message}</div>}

      <div className="panel">
        <h3>Create API Key</h3>
        <form onSubmit={createKey} className="api-key-form">
          <div className="form-grid">
            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="user@example.com"
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Friendly name"
              />
            </label>
            <label>
              Key Label
              <input
                type="text"
                value={form.keyName}
                onChange={(e) => handleChange('keyName', e.target.value)}
                placeholder="CLI key"
              />
            </label>
            <label>
              Permissions
              <input
                type="text"
                value={form.permissions}
                onChange={(e) => handleChange('permissions', e.target.value)}
                placeholder="comma,separated,scopes"
              />
            </label>
            <label>
              Rate Limit
              <input
                type="number"
                min="1"
                value={form.rateLimit}
                onChange={(e) => handleChange('rateLimit', parseInt(e.target.value || 0, 10) || 1)}
              />
            </label>
            <label>
              Expires At
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => handleChange('expiresAt', e.target.value)}
              />
            </label>
          </div>

          <button type="submit" className="btn primary" disabled={creating}>
            <Plus size={16} /> {creating ? 'Creating…' : 'Create Key'}
          </button>
        </form>

        {createdKey && (
          <div className="created-key">
            <p className="warning">Copy this key now. It will not be shown again.</p>
            <div className="key-row">
              <span className="label">Key</span>
              <code>{createdKey.api_key}</code>
            </div>
            <div className="key-row">
              <span className="label">Key ID</span>
              <code>{createdKey.key_id}</code>
            </div>
            <div className="key-row">
              <span className="label">Prefix</span>
              <code>{createdKey.key_prefix}</code>
            </div>
            {createdKey.name && (
              <div className="key-row">
                <span className="label">Name</span>
                <code>{createdKey.name}</code>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Manage Keys</h3>
          <div className="user-input">
            <input
              type="number"
              min="1"
              value={userId}
              placeholder="User ID"
              onChange={(e) => setUserId(e.target.value)}
            />
            <button className="btn" onClick={() => fetchKeys()} disabled={loadingKeys}>
              <RefreshCw size={16} /> Load
            </button>
          </div>
        </div>

        {keys.length === 0 ? (
          <p className="muted">No API keys found for this user.</p>
        ) : (
          <table className="keys-table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Name</th>
                <th>Rate Limit</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => (
                <tr key={key.id}>
                  <td>{key.key_prefix}</td>
                  <td>{key.name || '—'}</td>
                  <td>{key.rate_limit || 'N/A'}</td>
                  <td>{new Date(key.created_at).toLocaleString()}</td>
                  <td>
                    <button className="btn danger" onClick={() => revokeKey(key.id)} title="Revoke key">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ApiKeysPage;
