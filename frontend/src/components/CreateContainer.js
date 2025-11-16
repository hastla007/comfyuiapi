import React, { useState } from 'react';
import './CreateContainer.css';

function CreateContainer({ onCreate, workflows }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    port: '',
    workflowId: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.port) {
      alert('Please fill in all fields');
      return;
    }

    // Convert port to number and workflowId to number or undefined
    const containerData = {
      name: formData.name,
      port: parseInt(formData.port, 10),
      workflowId: formData.workflowId ? parseInt(formData.workflowId, 10) : undefined
    };

    const success = await onCreate(containerData);
    if (success) {
      setFormData({ name: '', port: '', workflowId: '' });
      setShowForm(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="create-container">
      {!showForm ? (
        <button className="btn-create" onClick={() => setShowForm(true)}>
          + Create New Container
        </button>
      ) : (
        <div className="create-form">
          <div className="form-header">
            <h3>Create New ComfyUI Container</h3>
            <button className="btn-close" onClick={() => setShowForm(false)}>
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Container Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., comfyui-stable-diffusion"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="port">Port</label>
              <input
                type="number"
                id="port"
                name="port"
                value={formData.port}
                onChange={handleChange}
                placeholder="e.g., 8190"
                min="1024"
                max="65535"
                required
              />
              <small>Choose a port between 1024-65535 (avoid 8188-8189 if instances 1-2 are running)</small>
            </div>

            <div className="form-group">
              <label htmlFor="workflowId">Workflow (Optional)</label>
              <select
                id="workflowId"
                name="workflowId"
                value={formData.workflowId}
                onChange={handleChange}
              >
                <option value="">No workflow</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
              <small>Select a workflow to run in this container</small>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Create Container
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CreateContainer;
