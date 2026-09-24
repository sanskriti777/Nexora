import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import WorkspaceSelector from '../navigation/WorkspaceSelector';
import Avatar from '../ui/Avatar';
import { useAuth } from '../../hooks/useAuth';

/**
 * Enterprise Application Sidebar Component
 */
export const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();

  const navSections = [
    {
      title: 'MAIN',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      ],
    },
    {
      title: 'WORK MANAGEMENT',
      items: [
        { label: 'Projects', path: '/projects', icon: '📁' },
        { label: 'Tasks', path: '/tasks', icon: '✓' },
        { label: 'Kanban Board', path: '/kanban', icon: '📋' },
        { label: 'Calendar', path: '/calendar', icon: '📅' },
      ],
    },
    {
      title: 'COLLABORATION',
      items: [
        { label: 'Teams', path: '/teams', icon: '👥' },
        { label: 'Chat', path: '/chat', icon: '💬' },
      ],
    },
    {
      title: 'FILES',
      items: [
        { label: 'Files', path: '/files', icon: '📎' },
        { label: 'Notifications', path: '/notifications', icon: '🔔' },
      ],
    },
    {
      title: 'INSIGHTS',
      items: [
        { label: 'Analytics', path: '/analytics', icon: '📈' },
        { label: 'Activity', path: '/activity', icon: '⏱️' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { label: 'Settings', path: '/settings', icon: '⚙️' },
        { label: 'Profile', path: '/profile', icon: '👤' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar ${isOpen ? 'sidebar-open' : ''}`} aria-label="Sidebar">
        {/* Brand Header */}
        <div className="sidebar-brand-header">
          <Link to="/dashboard" className="sidebar-brand-link" onClick={() => onClose && onClose()}>
            <img
              src="/logo_Light.png"
              alt="NEXORA"
              className="sidebar-brand-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="sidebar-brand-text">NEXORA</span>
          </Link>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Workspace Selector */}
        <div className="sidebar-workspace-wrapper">
          <WorkspaceSelector />
        </div>

        {/* Navigation Section List */}
        <nav className="sidebar-nav" aria-label="Main Navigation">
          {navSections.map((section) => (
            <div key={section.title} className="sidebar-nav-section">
              <div className="sidebar-section-heading">{section.title}</div>
              <ul className="sidebar-nav-list">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? 'active' : ''}`
                      }
                      onClick={() => onClose && onClose()}
                    >
                      <span className="sidebar-nav-icon">{item.icon}</span>
                      <span className="sidebar-nav-label">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* User Account / Footer */}
        <div className="sidebar-footer">
          <Link
            to="/profile"
            className="sidebar-user-block"
            onClick={() => onClose && onClose()}
          >
            <Avatar name={user?.name || user?.email || 'User'} size="sm" />
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">
                {user?.name || 'User'}
              </span>
              <span className="sidebar-user-email">
                {user?.email || 'Authenticated'}
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="sidebar-logout-btn"
            title="Sign out"
            aria-label="Sign out"
            onClick={logout}
          >
            ↪
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
