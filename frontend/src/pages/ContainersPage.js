import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ContainerList from '../components/ContainerList';
import CreateContainer from '../components/CreateContainer';
import { API_URL } from '../config';
import extractErrorMessage from '../utils/errorMessage';
import './ContainersPage.css';

function ContainersPage() {
  const [containers, setContainers] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [containerStats, setContainerStats] = useState({});

  useEffect(() => {
    fetchContainers();
    fetchWorkflows();
    const interval = setInterval(() => {
      fetchContainers();
      fetchWorkflows();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchContainers = async () => {
    try {
      const response = await axios.get(`${API_URL}/containers`);
      if (response.data.success) {
        setContainers(response.data.containers);
        await fetchContainerStats(response.data.containers);
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

  const fetchContainerStats = async (containerList) => {
    try {
      const statsPairs = await Promise.all(
        (containerList || []).map(async (container) => {
          try {
            const response = await axios.get(`${API_URL}/containers/${container.id}/stats`);
            if (response.data.success) {
              return [container.id, response.data.summary];
            }
          } catch (error) {
            return [container.id, null];
          }
          return [container.id, null];
        })
      );

      const nextStats = {};
      statsPairs.forEach(([id, summary]) => {
        nextStats[id] = summary;
      });
      setContainerStats(nextStats);
    } catch (error) {
      console.error('Failed to fetch container stats', error);
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
      alert(extractErrorMessage(error, 'Failed to create container'));
      return false;
    }
  };

  const handleAssignWorkflow = async (containerId, workflowId) => {
    try {
      const response = await axios.post(`${API_URL}/workflows/${workflowId}/assign/${containerId}`);
      if (response.data.success) {
        fetchContainers();
        return true;
      }
    } catch (error) {
      console.error('Error assigning workflow:', error);
      alert(extractErrorMessage(error, 'Failed to assign workflow'));
      return false;
    }
  };

  return (
    <div className="containers-page">
      <h2>Container Management</h2>
      <CreateContainer onCreate={handleCreateContainer} workflows={workflows} />
      <ContainerList
        containers={containers}
        workflows={workflows}
        loading={loading}
        containerStats={containerStats}
        onStart={handleStartContainer}
        onStop={handleStopContainer}
        onRestart={handleRestartContainer}
        onDelete={handleDeleteContainer}
        onAssignWorkflow={handleAssignWorkflow}
      />
    </div>
  );
}

export default ContainersPage;
