import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Container,
  Briefcase,
  FolderOpen,
  Activity,
  Settings,
  KeyRound,
  BookOpen
} from 'lucide-react';
import './Layout.css';

function Layout({ children }) {
  const navItems = [
    { path: '/containers', icon: Container, label: 'Containers' },
    { path: '/jobs', icon: Briefcase, label: 'Jobs' },
    { path: '/files', icon: FolderOpen, label: 'Files' },
    {
      path: '/system',
      icon: Activity,
      label: 'System',
      children: [
        { path: '/system', label: 'Overview' },
        { path: '/workflows', label: 'Workflows' },
        { path: '/logs', label: 'Logs' },
        { path: '/settings', label: 'Settings' },
      ],
    },
    {
      path: '/api-docs',
      icon: BookOpen,
      label: 'API',
      children: [
        { path: '/queue', label: 'Queue' },
        { path: '/api-docs', label: 'API Docs' },
        { path: '/api-keys', label: 'API Keys' },
      ],
    },
  ];

  return (
    <div className="layout">
      <header className="layout-header">
        <h1>ComfyUI Manager</h1>
        <p>Manage and monitor ComfyUI Docker instances</p>
      </header>

      <nav className="layout-nav">
        {navItems.map(({ path, icon: Icon, label, children }) => (
          <div key={path} className="nav-group">
            <NavLink
              to={path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>

            {children?.length ? (
              <div className="nav-subitems">
                {children.map((child) => (
                  <NavLink
                    key={child.path}
                    to={child.path}
                    className={({ isActive }) =>
                      `nav-subitem ${isActive ? 'active' : ''}`
                    }
                  >
                    <span>{child.label}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>

      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}

export default Layout;
