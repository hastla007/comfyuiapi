import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Container,
  Workflow,
  FileText,
  List,
  Briefcase,
  FolderOpen,
  Activity,
  Settings,
  BookOpen
} from 'lucide-react';
import './Layout.css';

function Layout({ children }) {
  const navItems = [
    { path: '/containers', icon: Container, label: 'Containers' },
    { path: '/workflows', icon: Workflow, label: 'Workflows' },
    { path: '/logs', icon: FileText, label: 'Logs' },
    { path: '/queue', icon: List, label: 'Queue' },
    { path: '/jobs', icon: Briefcase, label: 'Jobs' },
    { path: '/files', icon: FolderOpen, label: 'Files' },
    { path: '/system', icon: Activity, label: 'System Info' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/api-docs', icon: BookOpen, label: 'API Docs' },
  ];

  return (
    <div className="layout">
      <header className="layout-header">
        <h1>ComfyUI Manager</h1>
        <p>Manage and monitor ComfyUI Docker instances</p>
      </header>

      <nav className="layout-nav">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}

export default Layout;
