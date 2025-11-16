import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import ContainerList from './components/ContainerList';
import CreateContainer from './components/CreateContainer';
import WorkflowManager from './components/WorkflowManager';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [containers, setContainers] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('containers');

  useEffect(() => {
    fetchContainers();
    fetchWorkflows();
    const interval = setInterval(fetchContainers, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchContainers = async () => {
    try {
      const response = await axios.get(`${API_URL}/containers`);
      if (response.data.success) {
        setContainers(response.data.containers);
      }
    } catch (error) {
      console.error('Error fetching containers:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const handleStartContainer = async (id) => {
    try {
      await axios.post(`${API_URL}/containers/${id}/start`);
      fetchContainers();
    } catch (error) {
      console.error('Error starting container:', error);
      alert('Failed to start container');
    }
  };

  const handleStopContainer = async (id) => {
    try {
      await axios.post(`${API_URL}/containers/${id}/stop`);
      fetchContainers();
    } catch (error) {
      console.error('Error stopping container:', error);
      alert('Failed to stop container');
    }
  };

  const handleRestartContainer = async (id) => {
    try {
      await axios.post(`${API_URL}/containers/${id}/restart`);
      fetchContainers();
    } catch (error) {
      console.error('Error restarting container:', error);
      alert('Failed to restart container');
    }
  };

  const handleDeleteContainer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this container?')) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/containers/${id}`);
      fetchContainers();
    } catch (error) {
      console.error('Error deleting container:', error);
      alert('Failed to delete container');
    }
  };

  const handleCreateContainer = async (containerData) => {
    try {
      const response = await axios.post(`${API_URL}/containers`, containerData);
      if (response.data.success) {
        fetchContainers();
        return true;
      }
    } catch (error) {
      console.error('Error creating container:', error);
      alert(error.response?.data?.error || 'Failed to create container');
      return false;
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>ComfyUI Container Manager</h1>
        <p>Manage multiple ComfyUI Docker instances</p>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'containers' ? 'active' : ''}
          onClick={() => setActiveTab('containers')}
        >
          Containers
        </button>
        <button
          className={activeTab === 'workflows' ? 'active' : ''}
          onClick={() => setActiveTab('workflows')}
        >
          Workflows
        </button>
      </nav>

      <main className="App-main">
        {activeTab === 'containers' && (
          <>
            <CreateContainer onCreate={handleCreateContainer} />
            <ContainerList
              containers={containers}
              loading={loading}
              onStart={handleStartContainer}
              onStop={handleStopContainer}
              onRestart={handleRestartContainer}
              onDelete={handleDeleteContainer}
            />
          </>
        )}

        {activeTab === 'workflows' && (
          <WorkflowManager workflows={workflows} onUpdate={fetchWorkflows} />
        )}
      </main>
    </div>
  );
}

export default App;
