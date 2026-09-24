import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import Avatar from '../ui/Avatar';
import { useAuth } from '../../hooks/useAuth';

/**
 * Enterprise Application Topbar Component
 */
export const Topbar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const createRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) {
        setIsCreateOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="app-topbar" aria-label="Topbar">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-mobile-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
        <Breadcrumbs />
      </div>

      {/* Center: Global Search */}
      <div className="topbar-center">
        <div className="topbar-search-box">
          <span className="search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search projects, tasks, people... (Ctrl+K)"
            aria-label="Global Search"
          />
          <kbd className="search-shortcut">⌘K</kbd>
        </div>
      </div>

      {/* Right: Actions, Notifications, User Menu */}
      <div className="topbar-right">
        {/* Create Button Dropdown */}
        <div className="topbar-dropdown" ref={createRef}>
          <button
            type="button"
            className="btn btn-primary btn-sm topbar-create-btn"
            onClick={() => setIsCreateOpen((prev) => !prev)}
            aria-expanded={isCreateOpen}
            aria-label="Create new item"
          >
            <span className="btn-plus-icon">+</span>
            <span>Create</span>
            <span className="btn-caret">{isCreateOpen ? '▲' : '▼'}</span>
          </button>

          {isCreateOpen && (
            <div className="dropdown-menu card topbar-dropdown-menu">
              <Link
                to="/projects"
                className="dropdown-item"
                onClick={() => setIsCreateOpen(false)}
              >
                <span className="dropdown-item-icon">📁</span>
                <span className="dropdown-item-label">New Project</span>
              </Link>
              <Link
                to="/tasks"
                className="dropdown-item"
                onClick={() => setIsCreateOpen(false)}
              >
                <span className="dropdown-item-icon">✓</span>
                <span className="dropdown-item-label">New Task</span>
              </Link>
              <Link
                to="/teams"
                className="dropdown-item"
                onClick={() => setIsCreateOpen(false)}
              >
                <span className="dropdown-item-icon">👥</span>
                <span className="dropdown-item-label">New Team</span>
              </Link>
            </div>
          )}
        </div>

        {/* Notifications Icon Button */}
        <Link
          to="/notifications"
          className="topbar-icon-button"
          title="Notifications"
          aria-label="Notifications"
        >
          <span className="topbar-icon">🔔</span>
        </Link>

        {/* User Menu Dropdown */}
        <div className="topbar-dropdown" ref={userMenuRef}>
          <button
            type="button"
            className="topbar-user-trigger"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            aria-expanded={isUserMenuOpen}
            aria-label="User Account Menu"
          >
            <Avatar name={user?.name || user?.email || 'User'} size="sm" />
            <span className="topbar-user-name">{user?.name ? user.name.split(' ')[0] : 'User'}</span>
            <span className="topbar-caret">{isUserMenuOpen ? '▲' : '▼'}</span>
          </button>

          {isUserMenuOpen && (
            <div className="dropdown-menu card topbar-dropdown-menu right-aligned">
              <div className="dropdown-user-header">
                <span className="user-header-name">{user?.name || 'User'}</span>
                <span className="user-header-email">{user?.email || 'Authenticated'}</span>
              </div>
              <div className="dropdown-divider" />
              <Link
                to="/profile"
                className="dropdown-item"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <span className="dropdown-item-icon">👤</span>
                <span className="dropdown-item-label">Profile</span>
              </Link>
              <Link
                to="/settings"
                className="dropdown-item"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <span className="dropdown-item-icon">⚙️</span>
                <span className="dropdown-item-label">Settings</span>
              </Link>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item dropdown-logout-item"
                onClick={handleLogout}
              >
                <span className="dropdown-item-icon">↪</span>
                <span className="dropdown-item-label">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
