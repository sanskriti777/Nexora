import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const routeTitleMap = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tasks: 'Tasks',
  kanban: 'Kanban Board',
  calendar: 'Calendar',
  teams: 'Teams',
  chat: 'Chat',
  files: 'Files',
  notifications: 'Notifications',
  analytics: 'Analytics',
  activity: 'Activity Log',
  settings: 'Settings',
  profile: 'Profile',
  health: 'System Health',
};

/**
 * Topbar Breadcrumbs Component
 */
export const Breadcrumbs = () => {
  const location = useLocation();
  const pathSnippets = location.pathname.split('/').filter(Boolean);

  if (pathSnippets.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="breadcrumbs-container">
        <span className="breadcrumb-current">Dashboard</span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs-container">
      <Link to="/dashboard" className="breadcrumb-link">
        Nexora
      </Link>
      {pathSnippets.map((snippet, index) => {
        const isLast = index === pathSnippets.length - 1;
        const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
        const title = routeTitleMap[snippet] || snippet.charAt(0).toUpperCase() + snippet.slice(1);

        return (
          <React.Fragment key={url}>
            <span className="breadcrumb-separator">/</span>
            {isLast ? (
              <span className="breadcrumb-current" aria-current="page">
                {title}
              </span>
            ) : (
              <Link to={url} className="breadcrumb-link">
                {title}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
