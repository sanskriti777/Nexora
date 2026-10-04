import React, { useState, useEffect, useMemo } from 'react';
import analyticsService from '../services/analyticsService';
import workspaceService from '../services/workspaceService';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';

/**
 * Helper to compute date string in 'YYYY-MM-DD' format
 */
const formatDateInput = (date) => {
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
};

/**
 * Format date for short trend axis label ('MM/DD' or 'DD MMM')
 */
const formatAxisDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${monthNames[m] || parts[1]} ${d}`;
  }
  return dateString;
};

export const AnalyticsPage = () => {
  const { user } = useAuth();

  // Workspace List & Selection
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => {
    return user?.active_workspace_id || localStorage.getItem('nexora_active_workspace_id') || '';
  });

  // Date Filter Inputs
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState('all');

  // Applied Filters State (triggers query execution)
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    workspace_id: user?.active_workspace_id || localStorage.getItem('nexora_active_workspace_id') || '',
    start_date: '',
    end_date: '',
  }));

  // Data & Async States
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [isInitializing, setIsInitializing] = useState(true);

  // 1. Resolve accessible workspaces on mount
  useEffect(() => {
    let ignore = false;
    workspaceService
      .getWorkspaces()
      .then((res) => {
        if (!ignore && res?.data) {
          setWorkspaces(res.data);
          let targetWsId = user?.active_workspace_id || localStorage.getItem('nexora_active_workspace_id') || '';
          if (res.data.length > 0) {
            const exists = res.data.some((w) => String(w.id) === String(targetWsId));
            if (!exists) {
              targetWsId = String(res.data[0].id);
            }
          }
          setSelectedWorkspaceId(targetWsId);
          setAppliedFilters({
            workspace_id: targetWsId,
            start_date: '',
            end_date: '',
          });
        }
        if (!ignore) {
          setIsInitializing(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setIsInitializing(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user?.active_workspace_id]);

  // 2. Fetch Analytics Data when appliedFilters or refreshTrigger changes
  useEffect(() => {
    if (isInitializing) return;

    let ignore = false;
    const params = {};
    if (appliedFilters.workspace_id) {
      params.workspace_id = appliedFilters.workspace_id;
    }
    if (appliedFilters.start_date) {
      params.start_date = appliedFilters.start_date;
    }
    if (appliedFilters.end_date) {
      params.end_date = appliedFilters.end_date;
    }

    analyticsService
      .getOverview(params)
      .then((response) => {
        if (!ignore) {
          if (response && response.success) {
            setAnalyticsData(response.data);
            setErrorMessage(null);
          } else {
            setErrorMessage(response?.message || 'Unable to load analytics.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err.status === 422 && err.errors) {
            const errorDetails = Object.values(err.errors).flat().join(' ');
            setErrorMessage(errorDetails || err.message || 'Invalid date range provided.');
          } else if (err.status === 403) {
            setErrorMessage('You do not have permission to view analytics for this workspace.');
          } else {
            setErrorMessage(err.message || 'Failed to load analytics. Please try again.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [appliedFilters, refreshTrigger, isInitializing]);

  // Handle Date Filter Presets
  const applyPreset = (preset) => {
    setActivePreset(preset);
    setValidationError(null);
    setIsLoading(true);
    setAnalyticsData(null);
    const today = new Date();

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setAppliedFilters((prev) => ({
        ...prev,
        start_date: '',
        end_date: '',
      }));
      return;
    }

    if (preset === '7d') {
      const past = new Date();
      past.setDate(today.getDate() - 6);
      const startStr = formatDateInput(past);
      const endStr = formatDateInput(today);
      setStartDate(startStr);
      setEndDate(endStr);
      setAppliedFilters((prev) => ({
        ...prev,
        start_date: startStr,
        end_date: endStr,
      }));
      return;
    }

    if (preset === '30d') {
      const past = new Date();
      past.setDate(today.getDate() - 29);
      const startStr = formatDateInput(past);
      const endStr = formatDateInput(today);
      setStartDate(startStr);
      setEndDate(endStr);
      setAppliedFilters((prev) => ({
        ...prev,
        start_date: startStr,
        end_date: endStr,
      }));
      return;
    }

    if (preset === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startStr = formatDateInput(startOfMonth);
      const endStr = formatDateInput(today);
      setStartDate(startStr);
      setEndDate(endStr);
      setAppliedFilters((prev) => ({
        ...prev,
        start_date: startStr,
        end_date: endStr,
      }));
    }
  };

  // Handle Manual Filter Submission
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setValidationError(null);

    if (startDate && endDate && startDate > endDate) {
      setValidationError('The start date must be before or equal to the end date.');
      return;
    }

    setIsLoading(true);
    setAnalyticsData(null);
    setActivePreset('custom');
    setAppliedFilters({
      workspace_id: selectedWorkspaceId,
      start_date: startDate || '',
      end_date: endDate || '',
    });
  };

  // Reset Filters to default
  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setActivePreset('all');
    setValidationError(null);
    setIsLoading(true);
    setAnalyticsData(null);
    setAppliedFilters((prev) => ({
      ...prev,
      start_date: '',
      end_date: '',
    }));
  };

  // Workspace change handler
  const handleWorkspaceChange = (e) => {
    const newWsId = e.target.value;
    setIsLoading(true);
    setAnalyticsData(null);
    setSelectedWorkspaceId(newWsId);
    setValidationError(null);
    setAppliedFilters((prev) => ({
      ...prev,
      workspace_id: newWsId,
    }));
  };

  // Extract sections safely
  const overview = analyticsData?.overview || {
    total_projects: 0,
    active_projects: 0,
    completed_projects: 0,
    total_tasks: 0,
    completed_tasks: 0,
    incomplete_tasks: 0,
    overdue_tasks: 0,
    completion_percentage: 0,
  };

  const taskDistribution = analyticsData?.task_distribution || {
    by_status: { todo: 0, in_progress: 0, review: 0, done: 0 },
    by_priority: { low: 0, medium: 0, high: 0, urgent: 0 },
  };

  const completionTrend = useMemo(
    () => analyticsData?.completion_trend || [],
    [analyticsData?.completion_trend]
  );
  const projectsList = analyticsData?.projects || [];
  const workload = analyticsData?.workload || {
    assignees: [],
    unassigned: { total_tasks: 0, completed_tasks: 0, incomplete_tasks: 0, overdue_tasks: 0 },
  };

  // Trend Chart Calculations
  const trendMetrics = useMemo(() => {
    if (!completionTrend.length) {
      return { maxVal: 1, points: [], totalTrendCompleted: 0, pathString: '', areaString: '' };
    }

    const totalTrendCompleted = completionTrend.reduce(
      (sum, item) => sum + (item.completed ?? item.completed_tasks ?? 0),
      0
    );
    const maxVal = Math.max(
      ...completionTrend.map((d) => d.completed ?? d.completed_tasks ?? 0),
      4
    );
    const chartWidth = 650;
    const chartHeight = 160;
    const paddingX = 25;
    const paddingY = 20;
    const innerWidth = chartWidth - paddingX * 2;
    const innerHeight = chartHeight - paddingY * 2;

    const stepX = completionTrend.length > 1 ? innerWidth / (completionTrend.length - 1) : 0;

    const points = completionTrend.map((item, idx) => {
      const x = paddingX + idx * stepX;
      const val = item.completed ?? item.completed_tasks ?? 0;
      const y = paddingY + innerHeight - (val / maxVal) * innerHeight;
      return { x, y, val, date: item.date, day: item.day };
    });

    const pathString = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaString = `${pathString} L ${(paddingX + innerWidth).toFixed(1)} ${(paddingY + innerHeight).toFixed(1)} L ${paddingX} ${(paddingY + innerHeight).toFixed(1)} Z`;

    return { maxVal, points, totalTrendCompleted, pathString, areaString };
  }, [completionTrend]);

  // Proportions for Task Status Distribution
  const statusCounts = taskDistribution.by_status || { todo: 0, in_progress: 0, review: 0, done: 0 };
  const totalStatusTasks =
    (statusCounts.todo || 0) +
    (statusCounts.in_progress || 0) +
    (statusCounts.review || 0) +
    (statusCounts.done || 0);

  const statusPercents = {
    done: totalStatusTasks > 0 ? Math.round(((statusCounts.done || 0) / totalStatusTasks) * 100) : 0,
    review: totalStatusTasks > 0 ? Math.round(((statusCounts.review || 0) / totalStatusTasks) * 100) : 0,
    in_progress: totalStatusTasks > 0 ? Math.round(((statusCounts.in_progress || 0) / totalStatusTasks) * 100) : 0,
    todo: totalStatusTasks > 0 ? Math.round(((statusCounts.todo || 0) / totalStatusTasks) * 100) : 0,
  };

  // Proportions for Priority Distribution
  const priorityCounts = taskDistribution.by_priority || { low: 0, medium: 0, high: 0, urgent: 0 };
  const totalPriorityTasks =
    (priorityCounts.low || 0) +
    (priorityCounts.medium || 0) +
    (priorityCounts.high || 0) +
    (priorityCounts.urgent || 0);

  const priorityPercents = {
    urgent: totalPriorityTasks > 0 ? Math.round(((priorityCounts.urgent || 0) / totalPriorityTasks) * 100) : 0,
    high: totalPriorityTasks > 0 ? Math.round(((priorityCounts.high || 0) / totalPriorityTasks) * 100) : 0,
    medium: totalPriorityTasks > 0 ? Math.round(((priorityCounts.medium || 0) / totalPriorityTasks) * 100) : 0,
    low: totalPriorityTasks > 0 ? Math.round(((priorityCounts.low || 0) / totalPriorityTasks) * 100) : 0,
  };

  const isCompletelyEmpty =
    !isLoading &&
    !errorMessage &&
    overview.total_projects === 0 &&
    overview.total_tasks === 0;

  return (
    <div className="module-container analytics-container" id="analytics-page-root">
      {/* 1. Page Header */}
      <div className="module-header-row">
        <div>
          <h1 className="module-page-title">Analytics</h1>
          <p className="module-page-subtitle">Track project, task, and team performance.</p>
        </div>
        <div className="analytics-header-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setRefreshTrigger((prev) => prev + 1);
            }}
            disabled={isLoading}
            aria-label="Refresh analytics data"
          >
            {isLoading ? 'Refreshing...' : '🔄 Refresh'}
          </Button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="analytics-filter-card">
        <form onSubmit={handleApplyFilters} className="analytics-filter-form">
          <div className="analytics-filter-row">
            {/* Workspace Selector */}
            <div className="analytics-filter-item">
              <label htmlFor="analytics-workspace-select" className="analytics-filter-label">
                Workspace
              </label>
              <select
                id="analytics-workspace-select"
                className="analytics-filter-select"
                value={selectedWorkspaceId}
                onChange={handleWorkspaceChange}
                disabled={isLoading}
              >
                {workspaces.length === 0 ? (
                  <option value="">Default Workspace</option>
                ) : (
                  workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Start Date */}
            <div className="analytics-filter-item">
              <label htmlFor="analytics-start-date" className="analytics-filter-label">
                Start Date
              </label>
              <input
                type="date"
                id="analytics-start-date"
                className="analytics-filter-input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setValidationError(null);
                }}
                disabled={isLoading}
              />
            </div>

            {/* End Date */}
            <div className="analytics-filter-item">
              <label htmlFor="analytics-end-date" className="analytics-filter-label">
                End Date
              </label>
              <input
                type="date"
                id="analytics-end-date"
                className="analytics-filter-input"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setValidationError(null);
                }}
                disabled={isLoading}
              />
            </div>

            {/* Filter Buttons */}
            <div className="analytics-filter-btn-group">
              <Button type="submit" variant="primary" size="sm" disabled={isLoading}>
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                disabled={isLoading && !startDate && !endDate}
              >
                Reset
              </Button>
            </div>
          </div>

          {/* Quick Date Range Presets */}
          <div className="analytics-presets-row">
            <span className="analytics-filter-label" style={{ marginRight: '6px' }}>
              Quick Range:
            </span>
            <button
              type="button"
              className={`analytics-preset-btn ${activePreset === '7d' ? 'active' : ''}`}
              onClick={() => applyPreset('7d')}
              disabled={isLoading}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              className={`analytics-preset-btn ${activePreset === '30d' ? 'active' : ''}`}
              onClick={() => applyPreset('30d')}
              disabled={isLoading}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              className={`analytics-preset-btn ${activePreset === 'month' ? 'active' : ''}`}
              onClick={() => applyPreset('month')}
              disabled={isLoading}
            >
              This Month
            </button>
            <button
              type="button"
              className={`analytics-preset-btn ${activePreset === 'all' ? 'active' : ''}`}
              onClick={() => applyPreset('all')}
              disabled={isLoading}
            >
              All Time
            </button>
          </div>

          {/* Validation Feedback */}
          {validationError && (
            <div className="analytics-validation-error" role="alert">
              <span>⚠️</span>
              <span>{validationError}</span>
            </div>
          )}
        </form>
      </div>

      {/* Error State Banner */}
      {errorMessage && (
        <div className="analytics-error-card" role="alert">
          <div className="analytics-error-content">
            <span className="analytics-error-icon" aria-hidden="true">⚠️</span>
            <div>
              <h2 className="analytics-error-title">Analytics Unavailable</h2>
              <p className="analytics-error-message">{errorMessage}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshTrigger((p) => p + 1)}>
            Retry Connection
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div aria-busy="true" aria-label="Loading analytics data">
          {/* Skeleton KPI Row */}
          <div className="analytics-kpi-grid mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="analytics-skeleton-kpi" />
            ))}
          </div>

          {/* Skeleton Charts */}
          <div className="analytics-two-col mb-6">
            <div className="analytics-skeleton-chart" />
            <div className="analytics-skeleton-chart" />
          </div>

          {/* Skeleton Trend Chart */}
          <div className="analytics-skeleton-chart mb-6" />

          {/* Skeleton Tables */}
          <div className="analytics-skeleton-table mb-6" />
          <div className="analytics-skeleton-table" />
        </div>
      )}

      {/* Main Content Area (Rendered when not loading and no fatal error) */}
      {!isLoading && !errorMessage && (
        <>
          {/* Empty Workspace Notification */}
          {isCompletelyEmpty && (
            <Card className="analytics-empty-box">
              <span className="analytics-empty-icon" aria-hidden="true">📊</span>
              <h3 className="analytics-empty-title">No analytics recorded yet</h3>
              <p className="analytics-empty-desc">
                This workspace currently has no recorded projects or tasks. As your team creates projects, assigns tasks,
                and marks items complete, real-time performance indicators and workload metrics will automatically appear here.
              </p>
            </Card>
          )}

          {/* 3. Overview KPI Cards (8 metrics) */}
          <div className="analytics-kpi-grid">
            {/* Total Projects */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Total Projects</span>
                <span className="analytics-kpi-value">{overview.total_projects}</span>
                <span className="analytics-kpi-subtext">Across workspace</span>
              </div>
              <div className="analytics-kpi-icon icon-blue" aria-hidden="true">📁</div>
            </div>

            {/* Active Projects */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Active Projects</span>
                <span className="analytics-kpi-value">{overview.active_projects}</span>
                <span className="analytics-kpi-subtext text-primary">In development</span>
              </div>
              <div className="analytics-kpi-icon icon-indigo" aria-hidden="true">⚡</div>
            </div>

            {/* Completed Projects */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Completed Projects</span>
                <span className="analytics-kpi-value">{overview.completed_projects}</span>
                <span className="analytics-kpi-subtext text-success">Finished milestones</span>
              </div>
              <div className="analytics-kpi-icon icon-green" aria-hidden="true">🏁</div>
            </div>

            {/* Total Tasks */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Total Tasks</span>
                <span className="analytics-kpi-value">{overview.total_tasks}</span>
                <span className="analytics-kpi-subtext">Scheduled work</span>
              </div>
              <div className="analytics-kpi-icon icon-blue" aria-hidden="true">📋</div>
            </div>

            {/* Completed Tasks */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Completed Tasks</span>
                <span className="analytics-kpi-value text-success">{overview.completed_tasks}</span>
                <span className="analytics-kpi-subtext text-success">Delivered work</span>
              </div>
              <div className="analytics-kpi-icon icon-green" aria-hidden="true">✓</div>
            </div>

            {/* Incomplete Tasks */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Incomplete Tasks</span>
                <span className="analytics-kpi-value">{overview.incomplete_tasks}</span>
                <span className="analytics-kpi-subtext">Pending completion</span>
              </div>
              <div className="analytics-kpi-icon icon-indigo" aria-hidden="true">⏱️</div>
            </div>

            {/* Overdue Tasks */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Overdue Tasks</span>
                <span className={`analytics-kpi-value ${overview.overdue_tasks > 0 ? 'text-danger' : ''}`}>
                  {overview.overdue_tasks}
                </span>
                <span className={`analytics-kpi-subtext ${overview.overdue_tasks > 0 ? 'text-danger font-semibold' : ''}`}>
                  {overview.overdue_tasks > 0 ? '! Attention required' : 'No overdue work'}
                </span>
              </div>
              <div className="analytics-kpi-icon icon-rose" aria-hidden="true">⚠️</div>
            </div>

            {/* Completion Percentage */}
            <div className="analytics-kpi-card">
              <div className="analytics-kpi-body">
                <span className="analytics-kpi-label">Completion Rate</span>
                <span className="analytics-kpi-value text-success">{overview.completion_percentage}%</span>
                <span className="analytics-kpi-subtext">Overall throughput</span>
              </div>
              <div className="analytics-kpi-icon icon-green" aria-hidden="true">📈</div>
            </div>
          </div>

          {/* 4 & 5. Distributions Row (Task Status & Priority) */}
          <div className="analytics-two-col">
            {/* Task Status Distribution */}
            <Card
              title="Task Status Distribution"
              subtitle="Distribution of tasks across active workflow states"
            >
              {totalStatusTasks === 0 ? (
                <div className="analytics-empty-box" style={{ padding: '32px 16px' }}>
                  <span className="analytics-empty-icon" style={{ fontSize: '28px' }} aria-hidden="true">📊</span>
                  <p className="analytics-empty-desc">No tasks to distribute in this filter scope.</p>
                </div>
              ) : (
                <div className="distribution-summary-row">
                  {/* Segmented Progress Bar */}
                  <div
                    className="status-segment-bar"
                    role="progressbar"
                    aria-label="Task status distribution"
                    aria-valuenow={statusPercents.done}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    {statusPercents.done > 0 && (
                      <div
                        className="status-segment-part"
                        style={{ width: `${statusPercents.done}%`, backgroundColor: '#16A34A' }}
                        title={`Done: ${statusCounts.done} (${statusPercents.done}%)`}
                      />
                    )}
                    {statusPercents.review > 0 && (
                      <div
                        className="status-segment-part"
                        style={{ width: `${statusPercents.review}%`, backgroundColor: '#6366F1' }}
                        title={`Review: ${statusCounts.review} (${statusPercents.review}%)`}
                      />
                    )}
                    {statusPercents.in_progress > 0 && (
                      <div
                        className="status-segment-part"
                        style={{ width: `${statusPercents.in_progress}%`, backgroundColor: '#2563EB' }}
                        title={`In Progress: ${statusCounts.in_progress} (${statusPercents.in_progress}%)`}
                      />
                    )}
                    {statusPercents.todo > 0 && (
                      <div
                        className="status-segment-part"
                        style={{ width: `${statusPercents.todo}%`, backgroundColor: '#94A3B8' }}
                        title={`To Do: ${statusCounts.todo} (${statusPercents.todo}%)`}
                      />
                    )}
                  </div>

                  {/* Distribution List */}
                  <div className="distribution-items-list">
                    <div className="distribution-item-row">
                      <div className="distribution-item-left">
                        <span className="distribution-color-dot" style={{ backgroundColor: '#16A34A' }} />
                        <span className="distribution-item-name">Done</span>
                      </div>
                      <div className="distribution-item-right">
                        <span className="distribution-count">{statusCounts.done}</span>
                        <span className="distribution-percent">{statusPercents.done}%</span>
                      </div>
                    </div>

                    <div className="distribution-item-row">
                      <div className="distribution-item-left">
                        <span className="distribution-color-dot" style={{ backgroundColor: '#6366F1' }} />
                        <span className="distribution-item-name">Review</span>
                      </div>
                      <div className="distribution-item-right">
                        <span className="distribution-count">{statusCounts.review}</span>
                        <span className="distribution-percent">{statusPercents.review}%</span>
                      </div>
                    </div>

                    <div className="distribution-item-row">
                      <div className="distribution-item-left">
                        <span className="distribution-color-dot" style={{ backgroundColor: '#2563EB' }} />
                        <span className="distribution-item-name">In Progress</span>
                      </div>
                      <div className="distribution-item-right">
                        <span className="distribution-count">{statusCounts.in_progress}</span>
                        <span className="distribution-percent">{statusPercents.in_progress}%</span>
                      </div>
                    </div>

                    <div className="distribution-item-row">
                      <div className="distribution-item-left">
                        <span className="distribution-color-dot" style={{ backgroundColor: '#94A3B8' }} />
                        <span className="distribution-item-name">To Do</span>
                      </div>
                      <div className="distribution-item-right">
                        <span className="distribution-count">{statusCounts.todo}</span>
                        <span className="distribution-percent">{statusPercents.todo}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Priority Distribution */}
            <Card
              title="Priority Distribution"
              subtitle="Workload categorized by urgency level"
            >
              {totalPriorityTasks === 0 ? (
                <div className="analytics-empty-box" style={{ padding: '32px 16px' }}>
                  <span className="analytics-empty-icon" style={{ fontSize: '28px' }} aria-hidden="true">⚡</span>
                  <p className="analytics-empty-desc">No tasks categorized yet.</p>
                </div>
              ) : (
                <div className="priority-list">
                  {/* Urgent */}
                  <div className="priority-row">
                    <div className="priority-meta">
                      <div className="priority-label-group">
                        <span className="priority-pill" style={{ backgroundColor: '#DC2626' }} />
                        <span className="font-semibold text-danger">Urgent</span>
                      </div>
                      <div>
                        <span className="font-semibold">{priorityCounts.urgent}</span>
                        <span className="text-secondary ml-2 font-mono" style={{ fontSize: '12px' }}>
                          ({priorityPercents.urgent}%)
                        </span>
                      </div>
                    </div>
                    <div className="priority-track">
                      <div
                        className="priority-bar-fill"
                        style={{ width: `${priorityPercents.urgent}%`, backgroundColor: '#DC2626' }}
                      />
                    </div>
                  </div>

                  {/* High */}
                  <div className="priority-row">
                    <div className="priority-meta">
                      <div className="priority-label-group">
                        <span className="priority-pill" style={{ backgroundColor: '#D97706' }} />
                        <span className="font-semibold" style={{ color: '#D97706' }}>High</span>
                      </div>
                      <div>
                        <span className="font-semibold">{priorityCounts.high}</span>
                        <span className="text-secondary ml-2 font-mono" style={{ fontSize: '12px' }}>
                          ({priorityPercents.high}%)
                        </span>
                      </div>
                    </div>
                    <div className="priority-track">
                      <div
                        className="priority-bar-fill"
                        style={{ width: `${priorityPercents.high}%`, backgroundColor: '#D97706' }}
                      />
                    </div>
                  </div>

                  {/* Medium */}
                  <div className="priority-row">
                    <div className="priority-meta">
                      <div className="priority-label-group">
                        <span className="priority-pill" style={{ backgroundColor: '#2563EB' }} />
                        <span className="font-semibold text-primary">Medium</span>
                      </div>
                      <div>
                        <span className="font-semibold">{priorityCounts.medium}</span>
                        <span className="text-secondary ml-2 font-mono" style={{ fontSize: '12px' }}>
                          ({priorityPercents.medium}%)
                        </span>
                      </div>
                    </div>
                    <div className="priority-track">
                      <div
                        className="priority-bar-fill"
                        style={{ width: `${priorityPercents.medium}%`, backgroundColor: '#2563EB' }}
                      />
                    </div>
                  </div>

                  {/* Low */}
                  <div className="priority-row">
                    <div className="priority-meta">
                      <div className="priority-label-group">
                        <span className="priority-pill" style={{ backgroundColor: '#64748B' }} />
                        <span className="font-semibold text-secondary">Low</span>
                      </div>
                      <div>
                        <span className="font-semibold">{priorityCounts.low}</span>
                        <span className="text-secondary ml-2 font-mono" style={{ fontSize: '12px' }}>
                          ({priorityPercents.low}%)
                        </span>
                      </div>
                    </div>
                    <div className="priority-track">
                      <div
                        className="priority-bar-fill"
                        style={{ width: `${priorityPercents.low}%`, backgroundColor: '#64748B' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* 6. Completion Trend Chart */}
          <Card
            title="Completion Trend"
            subtitle="Completed tasks over the selected time range"
          >
            <div className="analytics-trend-wrapper">
              <div className="trend-stats-header">
                <span>
                  Total Completed in Period: <strong>{trendMetrics.totalTrendCompleted}</strong> tasks
                </span>
                <span>
                  Data points: <strong>{completionTrend.length}</strong> days
                </span>
              </div>

              {completionTrend.length === 0 ? (
                <div className="analytics-empty-box" style={{ padding: '36px 16px' }}>
                  <span className="analytics-empty-icon" style={{ fontSize: '32px' }} aria-hidden="true">📈</span>
                  <p className="analytics-empty-desc">No completion trend data available for this range.</p>
                </div>
              ) : (
                <div className="trend-chart-svg-wrap">
                  <svg
                    className="trend-svg-interactive"
                    viewBox="0 0 650 160"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Task completion trend line chart"
                  >
                    <defs>
                      <linearGradient id="analyticsTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Reference Grid Lines */}
                    <line x1="25" y1="20" x2="625" y2="20" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1="25" y1="80" x2="625" y2="80" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1="25" y1="140" x2="625" y2="140" stroke="#CBD5E1" strokeWidth="1" />

                    {/* Area Under Curve */}
                    {trendMetrics.points.length > 1 && (
                      <path d={trendMetrics.areaString} fill="url(#analyticsTrendGradient)" />
                    )}

                    {/* Line Stroke */}
                    {trendMetrics.points.length > 1 && (
                      <path
                        d={trendMetrics.pathString}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Data Points */}
                    {trendMetrics.points.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={trendMetrics.points.length > 30 ? 2 : 4}
                          fill="#FFFFFF"
                          stroke="#2563EB"
                          strokeWidth="2"
                        >
                          <title>{`${p.date}: ${p.val} task${p.val === 1 ? '' : 's'} completed`}</title>
                        </circle>
                      </g>
                    ))}
                  </svg>

                  {/* Date Axis Row (Responsive sampling if many dates) */}
                  <div className="trend-axis-labels">
                    {completionTrend.length <= 14 ? (
                      completionTrend.map((d, i) => (
                        <span key={i} title={d.date}>
                          {formatAxisDate(d.date)}
                        </span>
                      ))
                    ) : (
                      <>
                        <span>{formatAxisDate(completionTrend[0]?.date)}</span>
                        <span>{formatAxisDate(completionTrend[Math.floor(completionTrend.length / 2)]?.date)}</span>
                        <span>{formatAxisDate(completionTrend[completionTrend.length - 1]?.date)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 7. Project Performance */}
          <Card
            title="Project Performance"
            subtitle="Throughput and task completion rates across workspace projects"
          >
            {projectsList.length === 0 ? (
              <div className="analytics-empty-box" style={{ padding: '36px 16px' }}>
                <span className="analytics-empty-icon" style={{ fontSize: '32px' }} aria-hidden="true">📁</span>
                <p className="analytics-empty-desc">No projects found in this workspace context.</p>
              </div>
            ) : (
              <div className="analytics-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Total Tasks</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Completed</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Incomplete</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Overdue</th>
                      <th scope="col" style={{ minWidth: '140px' }}>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectsList.map((proj) => {
                      const statusVariant =
                        proj.status === 'completed'
                          ? 'success'
                          : proj.status === 'active'
                          ? 'primary'
                          : proj.status === 'on_hold'
                          ? 'warning'
                          : 'neutral';

                      return (
                        <tr key={proj.id}>
                          <td>
                            <div className="project-name-cell">
                              <span className="project-icon-badge" aria-hidden="true">📁</span>
                              <span className="font-semibold">{proj.name}</span>
                            </div>
                          </td>
                          <td>
                            <Badge variant={statusVariant}>
                              {proj.status ? proj.status.replace('_', ' ') : 'active'}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'center' }} className="font-mono">
                            {proj.total_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }} className="font-mono text-success font-semibold">
                            {proj.completed_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }} className="font-mono">
                            {proj.incomplete_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`font-mono ${proj.overdue_tasks > 0 ? 'text-danger font-semibold' : 'text-muted'}`}>
                              {proj.overdue_tasks}
                            </span>
                          </td>
                          <td>
                            <div className="progress-cell-wrap">
                              <div className="progress-cell-track">
                                <div
                                  className="progress-cell-fill"
                                  style={{ width: `${proj.completion_percentage || 0}%` }}
                                />
                              </div>
                              <span className="progress-cell-text">
                                {proj.completion_percentage}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 8. Team Workload */}
          <Card
            title="Team Workload"
            subtitle="Distribution of assigned tasks and delivery throughput per team member"
          >
            {(!workload.assignees || workload.assignees.length === 0) &&
            (!workload.unassigned || workload.unassigned.total_tasks === 0) ? (
              <div className="analytics-empty-box" style={{ padding: '36px 16px' }}>
                <span className="analytics-empty-icon" style={{ fontSize: '32px' }} aria-hidden="true">👥</span>
                <p className="analytics-empty-desc">No workload data recorded for this workspace.</p>
              </div>
            ) : (
              <div className="analytics-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th scope="col">Team Member</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Assigned Tasks</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Completed</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Incomplete</th>
                      <th scope="col" style={{ textAlign: 'center' }}>Overdue</th>
                      <th scope="col" style={{ minWidth: '140px' }}>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Assigned Members */}
                    {workload.assignees &&
                      workload.assignees.map((member, idx) => {
                        const mUser = member.user || {};
                        const mId = mUser.id || member.user_id || idx;
                        const mName = mUser.name || member.name || mUser.email || member.email || 'Team Member';
                        const mEmail = mUser.email || member.email || '';

                        return (
                          <tr key={mId}>
                            <td>
                              <div className="workload-user-cell">
                                <Avatar name={mName} size="sm" />
                                <div className="workload-user-info">
                                  <span className="workload-user-name">{mName}</span>
                                  {mEmail && <span className="workload-user-email">{mEmail}</span>}
                                </div>
                              </div>
                            </td>
                          <td style={{ textAlign: 'center' }} className="font-mono">
                            {member.total_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }} className="font-mono text-success font-semibold">
                            {member.completed_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }} className="font-mono">
                            {member.incomplete_tasks}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`font-mono ${member.overdue_tasks > 0 ? 'text-danger font-semibold' : 'text-muted'}`}>
                              {member.overdue_tasks}
                            </span>
                          </td>
                          <td>
                            <div className="progress-cell-wrap">
                              <div className="progress-cell-track">
                                <div
                                  className="progress-cell-fill"
                                  style={{ width: `${member.completion_percentage || 0}%` }}
                                />
                              </div>
                              <span className="progress-cell-text">
                                {member.completion_percentage}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        );
                      })}

                    {/* Unassigned Tasks Row (Preserving backend's unassigned bucket) */}
                    {workload.unassigned && workload.unassigned.total_tasks > 0 && (
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <td>
                          <div className="workload-user-cell">
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '15px',
                                color: '#64748B',
                              }}
                              aria-hidden="true"
                            >
                              ?
                            </div>
                            <div className="workload-user-info">
                              <span className="workload-user-name" style={{ color: '#475569' }}>
                                Unassigned Tasks
                              </span>
                              <span className="workload-user-email">
                                Tasks with no assignee specified
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }} className="font-mono">
                          {workload.unassigned.total_tasks}
                        </td>
                        <td style={{ textAlign: 'center' }} className="font-mono text-success font-semibold">
                          {workload.unassigned.completed_tasks}
                        </td>
                        <td style={{ textAlign: 'center' }} className="font-mono">
                          {workload.unassigned.incomplete_tasks}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`font-mono ${workload.unassigned.overdue_tasks > 0 ? 'text-danger font-semibold' : 'text-muted'}`}>
                            {workload.unassigned.overdue_tasks}
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const total = workload.unassigned.total_tasks || 0;
                            const comp = workload.unassigned.completed_tasks || 0;
                            const pct = total > 0 ? Math.round((comp / total) * 100) : 0;
                            return (
                              <div className="progress-cell-wrap">
                                <div className="progress-cell-track">
                                  <div
                                    className="progress-cell-fill"
                                    style={{ width: `${pct}%`, backgroundColor: '#94A3B8' }}
                                  />
                                </div>
                                <span className="progress-cell-text">{pct}%</span>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
