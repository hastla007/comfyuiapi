import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Layout from './components/Layout';
import ContainersPage from './pages/ContainersPage';
import WorkflowsPage from './pages/WorkflowsPage';
import LogsPage from './pages/LogsPage';
import QueuePage from './pages/QueuePage';
import JobsPage from './pages/JobsPage';
import FilesPage from './pages/FilesPage';
import SystemInfoPage from './pages/SystemInfoPage';
import SettingsPage from './pages/SettingsPage';
import ApiDocsPage from './pages/ApiDocsPage';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/containers" replace />} />
            <Route path="/containers" element={<ContainersPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/system" element={<SystemInfoPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/api-docs" element={<ApiDocsPage />} />
          </Routes>
        </Layout>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
