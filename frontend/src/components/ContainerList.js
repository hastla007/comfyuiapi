import React, { useState } from 'react';
import './ContainerList.css';

function ContainerList({ containers, workflows, loading, onStart, onStop, onRestart, onDelete, onAssignWorkflow }) {
  const [assigningWorkflow, setAssigningWorkflow] = useState(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  if (loading) {
    return <div className="loading">Loading containers...</div>;
  }

  if (containers.length === 0) {
    return (
      <div className="empty-state">
        <h3>No containers yet</h3>
        <p>Create your first ComfyUI container to get started</p>
      </div>
    );
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
        return '#4ade80';
      case 'exited':
      case 'stopped':
        return '#ef4444';
      case 'created':
        return '#fbbf24';
      default:
        return '#888';
    }
  };

  const getPortDisplay = (ports) => {
    if (!ports || ports.length === 0) return 'N/A';
    return ports.map(p => p.PublicPort || p.PrivatePort).join(', ');
  };

  const getWorkflowName = (workflowId) => {
    if (!workflowId) return 'None';
    const workflow = workflows.find(w => w.id === workflowId);
    return workflow ? workflow.name : `#${workflowId}`;
  };

  const handleOpenAssignModal = (container) => {
    setAssigningWorkflow(container.id);
    setSelectedWorkflow(container.workflow_id || '');
  };

  const handleCloseAssignModal = () => {
    setAssigningWorkflow(null);
    setSelectedWorkflow('');
  };

  const handleAssignSubmit = async () => {
    if (!selectedWorkflow) {
      alert('Please select a workflow');
      return;
    }
    const success = await onAssignWorkflow(assigningWorkflow, selectedWorkflow);
    if (success) {
      handleCloseAssignModal();
    }
  };

  return (
    <div className="container-list">
      <h2>Active Containers</h2>
      <div className="containers-grid">
        {containers.map((container) => (
          <div key={container.id} className="container-card">
            <div className="container-header">
              <h3>{container.name}</h3>
              <span
                className="status-badge"
                style={{ backgroundColor: getStatusColor(container.status) }}
              >
                {container.status}
              </span>
            </div>

            <div className="container-info">
              <div className="info-row">
                <span className="label">Port:</span>
                <span className="value">{container.port || getPortDisplay(container.ports)}</span>
              </div>
              <div className="info-row">
                <span className="label">Container ID:</span>
                <span className="value">{container.id?.substring(0, 12)}</span>
              </div>
              <div className="info-row">
                <span className="label">Workflow:</span>
                <span className="value">{getWorkflowName(container.workflow_id)}</span>
              </div>
            </div>

            <div className="container-actions">
              {container.status?.toLowerCase() === 'running' ? (
                <>
                  <a
                    href={`http://localhost:${container.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Open
                  </a>
                  <button onClick={() => onRestart(container.id)} className="btn btn-secondary">
                    Restart
                  </button>
                  <button onClick={() => onStop(container.id)} className="btn btn-warning">
                    Stop
                  </button>
                </>
              ) : (
                <button onClick={() => onStart(container.id)} className="btn btn-success">
                  Start
                </button>
              )}
              <button onClick={() => handleOpenAssignModal(container)} className="btn btn-secondary">
                Assign Workflow
              </button>
              <button onClick={() => onDelete(container.id)} className="btn btn-danger">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {assigningWorkflow && (
        <div className="modal-overlay" onClick={handleCloseAssignModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Workflow</h3>
              <button className="btn-close" onClick={handleCloseAssignModal}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="workflow-select">Select Workflow</label>
                <select
                  id="workflow-select"
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                  className="workflow-select"
                >
                  <option value="">Choose a workflow...</option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseAssignModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAssignSubmit}>
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContainerList;
