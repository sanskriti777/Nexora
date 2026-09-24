import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * PublicOnlyRoute Component
 *
 * Restricts access to guest-only pages (like login/register).
 * Redirects authenticated users to /dashboard.
 */
export const PublicOnlyRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="loading-spinner" />
        <p className="loading-caption">Initializing NEXORA...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default PublicOnlyRoute;
