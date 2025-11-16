import React, { useState, useEffect } from 'react';
import axios from 'axios';
import WorkflowManager from '../components/WorkflowManager';
import { API_URL } from '../config';
import './WorkflowsPage.css';

function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const response = await axios.get(`${API_URL}/workflows`);
      if (response.data.success) {
        setWorkflows(response.data.workflows);
      }
    } catch (error) {
      console.error('Error fetching workflows:', error);
    }
  };

  return (
    <div className="workflows-page">
      <h2>Workflow Management</h2>
      <WorkflowManager workflows={workflows} onUpdate={fetchWorkflows} />
    </div>
  );
}

export default WorkflowsPage;
