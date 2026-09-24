import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Layouts & Guards
import AppShell from '../components/layout/AppShell';
import AuthLayout from '../components/auth/AuthLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import PublicOnlyRoute from '../components/auth/PublicOnlyRoute';

// Authentication Pages
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';

// Business Pages
import DashboardPage from '../pages/DashboardPage';
import ProfilePage from '../pages/ProfilePage';
import ModulePlaceholderPage from '../pages/ModulePlaceholderPage';
import HealthPage from '../pages/HealthPage';
import NotFoundPage from '../pages/NotFoundPage';

/**
 * Root Redirector
 *
 * Navigates to /dashboard if authenticated, or /login if unauthenticated.
 */
const RootRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="loading-spinner" />
        <p className="loading-caption">Initializing NEXORA...</p>
      </div>
    );
  }

  return isAuthenticated ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <Navigate to="/login" replace />
  );
};

/**
 * Canonical Application Route Tree
 */
export const AppRoutes = () => {
  return (
    <Routes>
      {/* Root Entrypoint */}
      <Route path="/" element={<RootRedirect />} />

      {/* Guest Authentication Routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
        </Route>
      </Route>

      {/* Authenticated Application Shell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Work Management Module Placeholders */}
          <Route
            path="projects"
            element={
              <ModulePlaceholderPage
                title="Projects"
                subtitle="Manage and organize your workspace projects in one place."
                icon="📁"
                phaseNote="Projects module will be implemented in the next phase."
              />
            }
          />
          <Route
            path="tasks"
            element={
              <ModulePlaceholderPage
                title="Tasks"
                subtitle="Track tasks, assignees, priorities, and workflow progress."
                icon="✓"
                phaseNote="Tasks module will be implemented in the next phase."
              />
            }
          />
          <Route
            path="kanban"
            element={
              <ModulePlaceholderPage
                title="Kanban Board"
                subtitle="Visual task lifecycle across To Do, In Progress, Review, and Done."
                icon="📋"
                phaseNote="Kanban board will be implemented in the next phase."
              />
            }
          />
          <Route
            path="calendar"
            element={
              <ModulePlaceholderPage
                title="Calendar"
                subtitle="Schedule milestones, delivery deadlines, and task timelines."
                icon="📅"
                phaseNote="Calendar module will be implemented in the next phase."
              />
            }
          />

          {/* Collaboration Module Placeholders */}
          <Route
            path="teams"
            element={
              <ModulePlaceholderPage
                title="Teams"
                subtitle="Manage workspace teams, departments, and members."
                icon="👥"
                phaseNote="Teams module will be implemented in the next phase."
              />
            }
          />
          <Route
            path="chat"
            element={
              <ModulePlaceholderPage
                title="Chat"
                subtitle="Direct messages and team channels for workspace collaboration."
                icon="💬"
                phaseNote="Chat module will be implemented in the next phase."
              />
            }
          />

          {/* Files & Notifications Module Placeholders */}
          <Route
            path="files"
            element={
              <ModulePlaceholderPage
                title="Files"
                subtitle="Shared documents, technical assets, and project attachments."
                icon="📎"
                phaseNote="Files module will be implemented in the next phase."
              />
            }
          />
          <Route
            path="notifications"
            element={
              <ModulePlaceholderPage
                title="Notifications"
                subtitle="Workspace alerts, assignment mentions, and status changes."
                icon="🔔"
                phaseNote="Notifications module will be implemented in the next phase."
              />
            }
          />

          {/* Insights Module Placeholders */}
          <Route
            path="analytics"
            element={
              <ModulePlaceholderPage
                title="Analytics"
                subtitle="Workspace velocity, project throughput, and operational metrics."
                icon="📈"
                phaseNote="Analytics module will be implemented in the next phase."
              />
            }
          />
          <Route
            path="activity"
            element={
              <ModulePlaceholderPage
                title="Activity"
                subtitle="Workspace audit log history and operational event trail."
                icon="⏱️"
                phaseNote="Activity module will be implemented in the next phase."
              />
            }
          />

          {/* System & User Modules */}
          <Route
            path="settings"
            element={
              <ModulePlaceholderPage
                title="Settings"
                subtitle="Workspace preferences, access controls, and integrations."
                icon="⚙️"
                phaseNote="Settings module will be implemented in the next phase."
              />
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="health" element={<HealthPage />} />
        </Route>
      </Route>

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
