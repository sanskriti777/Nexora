import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import dashboardService from '../services/dashboardService';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

/**
 * Enterprise Business Dashboard Component
 *
 * Fully data-driven, workspace-scoped, and permission-aware.
 * Strictly adheres to the zero-fake-data rule.
 */
export const DashboardPage = () => {
  const { user } = useAuth();

  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardService.getDashboardData();
      setDashboardData(data);
    } catch (err) {
      setError(
        err.message || 'Unable to load workspace dashboard. Please check your connection and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    dashboardService
      .getDashboardData()
      .then((data) => {
        if (!ignore) {
          setDashboardData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(
            err.message || 'Unable to load workspace dashboard. Please check your connection and try again.'
          );
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Derived user representation (zero mock fallback)
  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="module-container" id="dashboard-loading-view">
        <div className="skeleton-header">
          <div className="skeleton-box skeleton-title" />
          <div className="skeleton-box skeleton-subtitle" />
        </div>

        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="kpi-card skeleton-card">
              <div className="skeleton-box skeleton-kpi-label" />
              <div className="skeleton-box skeleton-kpi-val" />
              <div className="skeleton-box skeleton-kpi-sub" />
            </Card>
          ))}
        </div>

        <div className="dashboard-charts-grid">
          <Card className="skeleton-chart-card">
            <div className="skeleton-box skeleton-chart-body" />
          </Card>
          <Card className="skeleton-chart-card">
            <div className="skeleton-box skeleton-chart-body" />
          </Card>
        </div>
      </div>
    );
  }

  // 2. API Error State
  if (error) {
    return (
      <div className="module-container" id="dashboard-error-view">
        <Card className="dashboard-error-card">
          <div className="error-icon" aria-hidden="true">⚠️</div>
          <h2 className="error-heading">Dashboard Unavailable</h2>
          <p className="error-description">{error}</p>
          <Button variant="primary" onClick={fetchDashboard}>
            Retry Connection
          </Button>
        </Card>
      </div>
    );
  }

  const summary = dashboardData?.summary || {
    total_projects: 0,
    total_tasks: 0,
    completed_tasks: 0,
    in_progress_tasks: 0,
    overdue_tasks: 0,
  };

  const projectOverview = dashboardData?.project_overview || {
    completed: 0,
    in_progress: 0,
    todo: 0,
    overdue: 0,
    completed_percentage: 0,
    in_progress_percentage: 0,
    todo_percentage: 0,
    overdue_percentage: 0,
  };

  const trendData = dashboardData?.task_completion_trend || [];
  const totalTrendCompletions = trendData.reduce((acc, curr) => acc + (curr.completed || 0), 0);

  const myProjects = dashboardData?.my_projects || [];
  const upcomingDeadlines = dashboardData?.upcoming_deadlines || [];
  const recentActivity = dashboardData?.recent_activity || [];

  return (
    <div className="module-container" id="dashboard-view">
      {/* 1. Page Header */}
      <div className="module-header-row mb-6">
        <div>
          <h1 className="module-page-title">
            Good morning, {firstName} 👋
          </h1>
          <p className="module-page-subtitle">
            Here's what's happening with your workspace today.
          </p>
        </div>
      </div>

      {/* 2. KPI Cards Row */}
      <div className="kpi-grid mb-6">
        {/* Total Projects */}
        <Card className="kpi-card">
          <div className="kpi-card-content">
            <span className="kpi-label">Total Projects</span>
            <div className="kpi-value">{summary.total_projects}</div>
            <span className="kpi-subtext text-muted">
              {summary.total_projects === 0 ? 'No projects created yet' : 'Active workspace projects'}
            </span>
          </div>
          <div className="kpi-icon-wrap icon-blue" aria-hidden="true">📁</div>
        </Card>

        {/* Tasks Completed */}
        <Card className="kpi-card">
          <div className="kpi-card-content">
            <span className="kpi-label">Tasks Completed</span>
            <div className="kpi-value">{summary.completed_tasks}</div>
            <span className="kpi-subtext text-success font-semibold">
              {projectOverview.completed_percentage > 0
                ? `↑ ${projectOverview.completed_percentage}% completion rate`
                : '0% completion rate'}
            </span>
          </div>
          <div className="kpi-icon-wrap icon-green" aria-hidden="true">✓</div>
        </Card>

        {/* In Progress */}
        <Card className="kpi-card">
          <div className="kpi-card-content">
            <span className="kpi-label">In Progress</span>
            <div className="kpi-value">{summary.in_progress_tasks}</div>
            <span className="kpi-subtext text-muted">
              {projectOverview.in_progress_percentage > 0
                ? `• ${projectOverview.in_progress_percentage}% of total tasks`
                : 'No active workload'}
            </span>
          </div>
          <div className="kpi-icon-wrap icon-indigo" aria-hidden="true">⏱️</div>
        </Card>

        {/* Overdue Tasks */}
        <Card className="kpi-card">
          <div className="kpi-card-content">
            <span className="kpi-label">Overdue Tasks</span>
            <div className={`kpi-value ${summary.overdue_tasks > 0 ? 'text-danger' : ''}`}>
              {summary.overdue_tasks}
            </div>
            <span className={`kpi-subtext ${summary.overdue_tasks > 0 ? 'text-danger font-semibold' : 'text-muted'}`}>
              {summary.overdue_tasks > 0
                ? `! Attention required (${summary.overdue_tasks})`
                : 'All deadlines clear'}
            </span>
          </div>
          <div className="kpi-icon-wrap icon-rose" aria-hidden="true">⚠️</div>
        </Card>
      </div>

      {/* 3. Middle Section: Project Overview Donut & Task Completion Trend Line */}
      <div className="dashboard-charts-grid mb-6">
        {/* Project Overview Ring Chart */}
        <Card
          title="Project Overview"
          subtitle="Task distribution across lifecycle stages"
          className="dashboard-chart-card"
        >
          {summary.total_tasks === 0 ? (
            <div className="chart-empty-state">
              <span className="chart-empty-icon" aria-hidden="true">📊</span>
              <p className="chart-empty-text">No tasks recorded yet in this workspace.</p>
              <Link to="/tasks" className="btn btn-secondary btn-sm mt-3">
                Go to Tasks
              </Link>
            </div>
          ) : (
            <div className="donut-chart-container">
              {/* SVG Ring Chart */}
              <div className="donut-svg-wrapper">
                <svg className="donut-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" className="donut-track" />
                  {/* Segment: Done (Green) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    className="donut-segment segment-green"
                    strokeDasharray={`${(projectOverview.completed_percentage * 238) / 100} 238`}
                    strokeDashoffset="0"
                  />
                  {/* Segment: In-Progress (Blue) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    className="donut-segment segment-blue"
                    strokeDasharray={`${(projectOverview.in_progress_percentage * 238) / 100} 238`}
                    strokeDashoffset={`-${(projectOverview.completed_percentage * 238) / 100}`}
                  />
                  {/* Segment: To-Do (Amber) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    className="donut-segment segment-amber"
                    strokeDasharray={`${(projectOverview.todo_percentage * 238) / 100} 238`}
                    strokeDashoffset={`-${((projectOverview.completed_percentage + projectOverview.in_progress_percentage) * 238) / 100}`}
                  />
                  {/* Segment: Overdue (Red) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    className="donut-segment segment-rose"
                    strokeDasharray={`${(projectOverview.overdue_percentage * 238) / 100} 238`}
                    strokeDashoffset={`-${((projectOverview.completed_percentage + projectOverview.in_progress_percentage + projectOverview.todo_percentage) * 238) / 100}`}
                  />
                </svg>
                <div className="donut-center-label">
                  <span className="donut-center-count">{summary.total_tasks}</span>
                  <span className="donut-center-sub">Total Tasks</span>
                </div>
              </div>

              {/* Legend with Real API Percentages */}
              <div className="donut-legend">
                <div className="donut-legend-item">
                  <div className="legend-indicator-group">
                    <span className="legend-dot dot-green" />
                    <span className="legend-label">Done</span>
                  </div>
                  <span className="legend-value font-mono">{projectOverview.completed_percentage}%</span>
                </div>

                <div className="donut-legend-item">
                  <div className="legend-indicator-group">
                    <span className="legend-dot dot-blue" />
                    <span className="legend-label">In-Progress</span>
                  </div>
                  <span className="legend-value font-mono">{projectOverview.in_progress_percentage}%</span>
                </div>

                <div className="donut-legend-item">
                  <div className="legend-indicator-group">
                    <span className="legend-dot dot-amber" />
                    <span className="legend-label">To-Do</span>
                  </div>
                  <span className="legend-value font-mono">{projectOverview.todo_percentage}%</span>
                </div>

                <div className="donut-legend-item">
                  <div className="legend-indicator-group">
                    <span className="legend-dot dot-rose" />
                    <span className="legend-label">Overdue</span>
                  </div>
                  <span className="legend-value font-mono">{projectOverview.overdue_percentage}%</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Task Completion Trend */}
        <Card
          title="Task Completion Trend"
          subtitle="Daily velocity throughput over the past 7 days"
          className="dashboard-chart-card"
        >
          {totalTrendCompletions === 0 ? (
            <div className="chart-empty-state">
              <span className="chart-empty-icon" aria-hidden="true">📈</span>
              <p className="chart-empty-text">
                Not enough activity yet. Once real tasks are completed, the trend will populate.
              </p>
            </div>
          ) : (
            <div className="trend-chart-container">
              {/* Scaled SVG Line Chart */}
              <div className="trend-svg-wrapper">
                <svg className="trend-svg" viewBox="0 0 350 140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="0" y1="20" x2="350" y2="20" className="chart-grid-line" />
                  <line x1="0" y1="60" x2="350" y2="60" className="chart-grid-line" />
                  <line x1="0" y1="100" x2="350" y2="100" className="chart-grid-line" />

                  {/* Dynamically Computed Points */}
                  {(() => {
                    const maxVal = Math.max(...trendData.map((d) => d.completed), 1);
                    const stepX = 350 / (trendData.length - 1 || 1);
                    const points = trendData.map((d, idx) => {
                      const x = idx * stepX;
                      const y = 110 - (d.completed / maxVal) * 80;
                      return { x, y, completed: d.completed };
                    });

                    const pathString = points
                      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                      .join(' ');

                    const areaString = `${pathString} L 350 120 L 0 120 Z`;

                    return (
                      <>
                        <path d={areaString} fill="url(#trendGradient)" />
                        <path d={pathString} fill="none" stroke="#2563EB" strokeWidth="2.5" />
                        {points.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={p.x}
                            cy={p.y}
                            r="4"
                            fill="#FFFFFF"
                            stroke="#2563EB"
                            strokeWidth="2"
                          />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>

              {/* Day Axis */}
              <div className="trend-axis-row">
                {trendData.map((t, idx) => (
                  <span key={idx} className="trend-axis-label">
                    {t.day}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 4. My Projects Section */}
      <Card
        title="My Projects"
        subtitle="Active projects in your workspace"
        actions={
          <Link to="/projects" className="btn btn-secondary btn-sm">
            View All
          </Link>
        }
        className="mb-6"
      >
        {myProjects.length === 0 ? (
          <div className="table-empty-box">
            <span className="empty-box-icon" aria-hidden="true">📁</span>
            <h3 className="empty-box-title">No projects yet.</h3>
            <p className="empty-box-sub">
              Create your first project to start tracking work, deadlines, and progress.
            </p>
            <Link to="/projects" className="btn btn-primary btn-sm mt-3">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="projects-card-grid">
            {myProjects.map((p) => (
              <div key={p.id} className="project-summary-card">
                <div className="project-card-header">
                  <span className="project-card-name font-semibold">{p.name}</span>
                  <Badge variant={p.status === 'completed' ? 'success' : 'primary'}>
                    {p.status ? p.status.replace('_', ' ') : 'planning'}
                  </Badge>
                </div>
                {p.description && (
                  <p className="project-card-desc text-secondary">{p.description}</p>
                )}

                {/* Real Calculated Progress */}
                <div className="project-progress-container mt-3">
                  <div className="project-progress-labels">
                    <span className="progress-label-text">
                      {p.progress !== null ? `${p.progress}% completed` : 'No tasks'}
                    </span>
                    <span className="progress-task-counts font-mono">
                      {p.completed_tasks_count}/{p.tasks_count} tasks
                    </span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${p.progress || 0}%` }}
                    />
                  </div>
                </div>

                <div className="project-card-footer mt-3">
                  <span className="project-due-date text-muted">
                    {p.due_date ? `Due ${p.due_date}` : 'No due date'}
                  </span>
                  <span className="project-members-count text-secondary font-mono">
                    👥 {p.members_count || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 5. Bottom Two-Column: Upcoming Deadlines & Recent Activity */}
      <div className="dashboard-charts-grid">
        {/* Upcoming Deadlines */}
        <Card title="Upcoming Deadlines" subtitle="Scheduled project deliverables">
          {upcomingDeadlines.length === 0 ? (
            <div className="activity-empty-box">
              <span className="activity-empty-icon" aria-hidden="true">📅</span>
              <p className="activity-empty-text">No upcoming deadlines.</p>
            </div>
          ) : (
            <div className="deadline-list">
              {upcomingDeadlines.map((task) => (
                <div key={task.id} className="deadline-item">
                  <div className="deadline-info">
                    <span className="deadline-task-title font-semibold">{task.title}</span>
                    {task.project && (
                      <span className="deadline-project-badge font-xs text-muted">
                        📁 {task.project.name}
                      </span>
                    )}
                  </div>
                  <span className="deadline-date-pill font-mono font-xs">
                    {task.due_date_formatted || 'Soon'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card title="Recent Activity" subtitle="Workspace audit log trail">
          {recentActivity.length === 0 ? (
            <div className="activity-empty-box">
              <span className="activity-empty-icon" aria-hidden="true">⏱️</span>
              <p className="activity-empty-text">No recent activity.</p>
            </div>
          ) : (
            <div className="activity-list">
              {recentActivity.map((log) => (
                <div key={log.id} className="activity-item">
                  <div className="activity-bullet" aria-hidden="true">•</div>
                  <div className="activity-content">
                    <span className="activity-user font-semibold">
                      {log.user?.name || 'Workspace Member'}
                    </span>{' '}
                    <span className="activity-action text-secondary">{log.action}</span>
                    <span className="activity-time font-xs text-muted">
                      {log.created_at_human}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
