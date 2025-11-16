import React, { useState } from 'react';
import axios from 'axios';
import './WorkflowManager.css';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function WorkflowManager({ workflows, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    workflowJson: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        e.target.value = ''; // Reset file input
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          setFormData(prev => ({
            ...prev,
            workflowJson: JSON.stringify(json, null, 2)
          }));
          setError('');
        } catch (err) {
          setError('Invalid JSON file');
        }
      };
      reader.onerror = () => {
        setError('Failed to read file');
        e.target.value = ''; // Reset file input
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Workflow name is required');
      return;
    }

    if (!formData.workflowJson.trim()) {
      setError('Workflow JSON is required');
      return;
    }

    // Validate JSON
    let workflowJsonObj;
    try {
      workflowJsonObj = JSON.parse(formData.workflowJson);
    } catch (err) {
      setError('Invalid JSON format');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/workflows`, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        workflowJson: workflowJsonObj
      });

      if (response.data.success) {
        // Reset form and close modal
        setFormData({ name: '', description: '', workflowJson: '' });
        setShowForm(false);
        onUpdate(); // Refresh the workflow list
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create workflow');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete workflow "${name}"?`)) {
      return;
    }

    try {
      const response = await axios.delete(`${API_URL}/workflows/${id}`);
      if (response.data.success) {
        onUpdate(); // Refresh the workflow list
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete workflow');
    }
  };

  return (
    <div className="workflow-manager">
      <div className="workflow-header">
        <h2>Workflow Management</h2>
        <button className="btn-create" onClick={() => setShowForm(true)}>
          + Add Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="empty-state">
          <h3>No workflows yet</h3>
          <p>Create workflows to assign to your ComfyUI containers</p>
        </div>
      ) : (
        <div className="workflows-list">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="workflow-card">
              <div className="workflow-info">
                <h3>{workflow.name}</h3>
                <p>{workflow.description || 'No description'}</p>
                <small>Created: {new Date(workflow.created_at).toLocaleDateString()}</small>
              </div>
              <div className="workflow-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(workflow.id, workflow.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Workflow</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="error-message">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">Workflow Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Text to Image"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Brief description of the workflow"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="file-upload">Upload Workflow JSON</label>
                  <input
                    type="file"
                    id="file-upload"
                    accept=".json"
                    onChange={handleFileUpload}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="workflowJson">Workflow JSON *</label>
                  <textarea
                    id="workflowJson"
                    name="workflowJson"
                    value={formData.workflowJson}
                    onChange={handleInputChange}
                    placeholder='Paste your workflow JSON here or upload a file above'
                    rows={10}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Workflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkflowManager;
