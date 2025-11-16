import React, { useState } from 'react';
import './WorkflowManager.css';

function WorkflowManager({ workflows, onUpdate }) {
  const [showForm, setShowForm] = useState(false);

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
                <button className="btn btn-secondary">Edit</button>
                <button className="btn btn-danger">Delete</button>
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
            <div className="modal-body">
              <p className="info-text">
                Workflow management is coming soon. For now, you can manually add workflow
                JSON files to the workflows directory.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkflowManager;
