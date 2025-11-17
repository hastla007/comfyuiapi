import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Container,
  Briefcase,
  FolderOpen,
  Activity,
  Settings,
  BookOpen,
  FlaskConical
} from 'lucide-react';
import { API_URL } from '../config';
import './Layout.css';

function Layout({ children }) {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState(null);
  const [gpus, setGpus] = useState([]);

  const formatGb = (bytes) => {
    if (!bytes || bytes < 0) return '0.0';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1);
  };

  useEffect(() => {
    const fetchGpus = async () => {
      try {
        const response = await axios.get(`${API_URL}/health/gpus`);
        if (response.data?.success) {
          setGpus(response.data.gpus || []);
        }
      } catch (error) {
        // Silent failure - GPU info optional
      }
    };

    fetchGpus();
  }, []);

  const navItems = [
    { path: '/containers', icon: Container, label: 'Containers' },
    { path: '/jobs', icon: Briefcase, label: 'Jobs' },
    { path: '/queue', icon: Activity, label: 'Queue' },
    { path: '/files', icon: FolderOpen, label: 'Files' },
    { path: '/playground', icon: FlaskConical, label: 'Playground' },
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
        { path: '/api-docs', label: 'API Docs' },
        { path: '/api-keys', label: 'API Keys' },
      ],
    },
  ];

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="header-row">
          <div>
            <h1>ComfyUI Manager</h1>
            <p>Manage and monitor ComfyUI Docker instances</p>
          </div>
          {gpus.length > 0 && (
            <div className="gpu-list" aria-label="available-gpus">
              {gpus.map(gpu => (
                <span key={gpu.index} className="gpu-chip">
                  {gpu.name || `GPU ${gpu.index}`} ({formatGb(gpu.memory?.total)} GB)
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <nav className="layout-nav">
        {navItems.map(({ path, icon: Icon, label, children }) => (
          <div
            key={path}
            className={`nav-group ${openGroup === path ? 'open' : ''} ${location.pathname.startsWith(path) ? 'active-group' : ''}`}
            onMouseEnter={() => setOpenGroup(path)}
            onMouseLeave={() => setOpenGroup(null)}
            onFocus={() => setOpenGroup(path)}
            onBlur={() => setOpenGroup(null)}
          >
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
              <div className={`nav-subitems ${openGroup === path ? 'open' : ''}`}>
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
