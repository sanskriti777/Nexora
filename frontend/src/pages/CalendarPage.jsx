import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import calendarService from '../services/calendarService';
import workspaceService from '../services/workspaceService';
import projectService from '../services/projectService';
import teamService from '../services/teamService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarPage = () => {
  // Calendar Navigation State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeView, setActiveView] = useState('month'); // 'month' | 'list'

  // Workspace & Filter options
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [teamsList, setTeamsList] = useState([]);

  // Active Filters
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  // Data & Loading States
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Selected Day Modal / Popover for "+N more"
  const [expandedDayData, setExpandedDayData] = useState(null);

  // Load Workspaces on mount
  useEffect(() => {
    let ignore = false;
    workspaceService.getWorkspaces()
      .then((res) => {
        if (!ignore && res.data && res.data.length > 0) {
          setWorkspaces(res.data);
          setActiveWorkspaceId(res.data[0].id);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err.message || 'Failed to load workspace.');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Load filter options (projects & teams) when active workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let ignore = false;

    Promise.all([
      projectService.getProjects({ workspace_id: activeWorkspaceId, per_page: 100 }),
      teamService.getTeams({ workspace_id: activeWorkspaceId }),
    ])
      .then(([projRes, teamRes]) => {
        if (!ignore) {
          setProjectsList(projRes.data || []);
          setTeamsList(teamRes.data || []);
        }
      })
      .catch(() => {
        // Non-blocking filter list load
      });

    return () => {
      ignore = true;
    };
  }, [activeWorkspaceId]);

  // Compute month bounds for query
  const { startQueryDate, endQueryDate, calendarGridDays } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of current month
    const firstDayOfMonth = new Date(year, month, 1);
    // Day of week for first day (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const firstDayWeekday = firstDayOfMonth.getDay();

    // Last day of current month
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDayOfMonth.getDate();

    // Days from previous month to display
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const days = [];

    // Prepend padding days from previous month
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const dateObj = new Date(year, month - 1, dayNum);
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      days.push({
        dateString: `${y}-${m}-${d}`,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const m = String(month + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      const dateString = `${year}-${m}-${d}`;
      days.push({
        dateString,
        dayNumber: dayNum,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
      });
    }

    // Append padding days from next month to complete the grid (multiples of 7: 35 or 42)
    const totalCells = days.length <= 35 ? 35 : 42;
    const remainingDays = totalCells - days.length;
    for (let dayNum = 1; dayNum <= remainingDays; dayNum++) {
      const dateObj = new Date(year, month + 1, dayNum);
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      days.push({
        dateString: `${y}-${m}-${d}`,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    const startQueryDate = days[0].dateString;
    const endQueryDate = days[days.length - 1].dateString;

    return { startQueryDate, endQueryDate, calendarGridDays: days };
  }, [currentDate]);

  // Fetch calendar tasks for the computed date range
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let ignore = false;

    calendarService.getCalendar({
      start: startQueryDate,
      end: endQueryDate,
      workspace_id: activeWorkspaceId,
      project_id: selectedProjectId || undefined,
      team_id: selectedTeamId || undefined,
      status: selectedStatus || undefined,
      priority: selectedPriority || undefined,
      overdue: onlyOverdue ? 1 : undefined,
    })
      .then((res) => {
        if (!ignore) {
          setTasks(res.data || []);
          setIsLoading(false);
          setErrorMessage(null);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err.message || 'Failed to load calendar tasks.');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    activeWorkspaceId,
    startQueryDate,
    endQueryDate,
    selectedProjectId,
    selectedTeamId,
    selectedStatus,
    selectedPriority,
    onlyOverdue,
    refreshIndex,
  ]);

  // Group tasks by formatted date (YYYY-MM-DD)
  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const dateKey = t.due_date_formatted;
      if (!dateKey) continue;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(t);
    }
    return map;
  }, [tasks]);

  // KPI Metrics computed from real data
  const metrics = useMemo(() => {
    const total = tasks.length;
    let overdueCount = 0;
    let todayCount = 0;
    let doneCount = 0;

    for (const t of tasks) {
      if (t.is_overdue) overdueCount++;
      if (t.is_today) todayCount++;
      if (t.status === 'done') doneCount++;
    }

    return { total, overdueCount, todayCount, doneCount };
  }, [tasks]);

  // Date navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleResetFilters = () => {
    setSelectedProjectId('');
    setSelectedTeamId('');
    setSelectedStatus('');
    setSelectedPriority('');
    setOnlyOverdue(false);
  };

  const hasActiveFilters = Boolean(
    selectedProjectId || selectedTeamId || selectedStatus || selectedPriority || onlyOverdue
  );

  const getPriorityColorClass = (priority) => {
    switch (priority) {
      case 'urgent': return 'priority-urgent';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'done': return 'success';
      case 'in_progress': return 'primary';
      case 'review': return 'warning';
      case 'todo': return 'neutral';
      default: return 'neutral';
    }
  };

  return (
    <div className="calendar-page-container">
      {/* Page Header */}
      <div className="page-header mb-4">
        <div className="page-header-title-row flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="page-title text-2xl font-bold">Delivery Calendar</h1>
            <p className="page-subtitle text-secondary text-sm">
              Visualize task and project milestones across your workspace schedule.
            </p>
          </div>

          {/* Workspace Selector */}
          {workspaces.length > 1 && (
            <div className="workspace-switcher-select-wrap">
              <label htmlFor="calendar-ws-select" className="text-xs text-secondary font-medium mr-2">
                Workspace:
              </label>
              <select
                id="calendar-ws-select"
                className="input-field select-sm"
                value={activeWorkspaceId || ''}
                onChange={(e) => setActiveWorkspaceId(Number(e.target.value))}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Calendar KPI Strip */}
        <div className="calendar-kpi-bar mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="calendar-kpi-pill p-3 flex items-center justify-between">
            <span className="text-xs text-secondary font-medium">Scheduled Deadlines</span>
            <span className="text-lg font-bold text-main">{metrics.total}</span>
          </Card>
          <Card className="calendar-kpi-pill p-3 flex items-center justify-between">
            <span className="text-xs text-secondary font-medium">Due Today</span>
            <span className="text-lg font-bold text-primary">{metrics.todayCount}</span>
          </Card>
          <Card className="calendar-kpi-pill p-3 flex items-center justify-between">
            <span className="text-xs text-secondary font-medium">Overdue Items</span>
            <span className="text-lg font-bold text-danger">{metrics.overdueCount}</span>
          </Card>
          <Card className="calendar-kpi-pill p-3 flex items-center justify-between">
            <span className="text-xs text-secondary font-medium">Completed Deliveries</span>
            <span className="text-lg font-bold text-success">{metrics.doneCount}</span>
          </Card>
        </div>
      </div>

      {/* Navigation & Controls Bar */}
      <Card className="calendar-controls-card p-4 mb-4">
        <div className="calendar-nav-row flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Month Navigation */}
          <div className="calendar-month-nav flex items-center gap-3">
            <div className="btn-group flex items-center">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                title="Previous Month"
              >
                ◀
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleToday}
                title="Jump to current date"
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleNextMonth}
                aria-label="Next month"
                title="Next Month"
              >
                ▶
              </button>
            </div>

            <h2 className="current-month-heading text-xl font-bold text-main tracking-tight">
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
          </div>

          {/* View Switcher */}
          <div className="calendar-view-toggle flex items-center gap-2">
            <div className="view-toggle-group">
              <button
                type="button"
                className={`view-toggle-btn ${activeView === 'month' ? 'active' : ''}`}
                onClick={() => setActiveView('month')}
              >
                📅 Month Grid
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${activeView === 'list' ? 'active' : ''}`}
                onClick={() => setActiveView('list')}
              >
                📋 Schedule List
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setRefreshIndex((p) => p + 1)}
              title="Refresh Calendar"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="calendar-filters-toolbar mt-3 pt-3 border-t border-light flex flex-wrap items-center gap-3">
          {/* Project Filter */}
          <div className="filter-item">
            <select
              className="input-field select-filter text-xs"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">All Projects</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          {teamsList.length > 0 && (
            <div className="filter-item">
              <select
                className="input-field select-filter text-xs"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                <option value="">All Teams</option>
                {teamsList.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    👥 {tm.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div className="filter-item">
            <select
              className="input-field select-filter text-xs"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="filter-item">
            <select
              className="input-field select-filter text-xs"
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Overdue Checkbox */}
          <label className="checkbox-filter-label flex items-center gap-1.5 text-xs text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox-input"
              checked={onlyOverdue}
              onChange={(e) => setOnlyOverdue(e.target.checked)}
            />
            <span className="font-medium text-danger">Overdue Only</span>
          </label>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-outline btn-xs text-secondary ml-auto"
              onClick={handleResetFilters}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
      </Card>

      {/* Error Banner */}
      {errorMessage && (
        <div className="alert-banner alert-danger mb-4">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setErrorMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main View Area */}
      {isLoading ? (
        <Card className="calendar-loading-box text-center py-16">
          <div className="loading-spinner" />
          <p className="loading-caption mt-3">Loading schedule deadlines...</p>
        </Card>
      ) : activeView === 'month' ? (
        /* MONTH GRID VIEW */
        <Card className="calendar-grid-card p-0 overflow-hidden">
          {/* Weekday Header */}
          <div className="calendar-weekdays-row grid grid-cols-7 border-b border-light bg-slate-50">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name} className="weekday-cell text-center py-2.5 text-xs font-semibold text-secondary uppercase tracking-wider">
                {name}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="calendar-days-grid grid grid-cols-7">
            {calendarGridDays.map((cell) => {
              const dayTasks = tasksByDate[cell.dateString] || [];
              const hasTasks = dayTasks.length > 0;
              const displayTasks = dayTasks.slice(0, 3);
              const extraCount = dayTasks.length - 3;

              return (
                <div
                  key={cell.dateString}
                  className={`calendar-day-cell min-h-[110px] p-1.5 border-b border-r border-light flex flex-col justify-between transition-colors ${
                    !cell.isCurrentMonth ? 'day-other-month bg-slate-50/50' : 'bg-white'
                  } ${cell.isToday ? 'day-today' : ''}`}
                >
                  {/* Day Header */}
                  <div className="day-cell-top flex items-center justify-between mb-1">
                    <span
                      className={`day-number text-xs font-bold ${
                        cell.isToday
                          ? 'day-number-today-badge'
                          : cell.isCurrentMonth
                          ? 'text-main'
                          : 'text-muted'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {hasTasks && (
                      <span className="day-task-count text-[10px] text-secondary font-medium px-1.5 py-0.5 rounded bg-slate-100">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  {/* Tasks List within Cell */}
                  <div className="day-tasks-stack flex-1 flex flex-col gap-1 overflow-hidden">
                    {displayTasks.map((t) => (
                      <Link
                        key={t.id}
                        to={`/tasks/${t.id}`}
                        className={`calendar-task-card ${getPriorityColorClass(t.priority)} ${
                          t.is_overdue ? 'task-card-overdue' : ''
                        }`}
                        title={`${t.title} (${t.status.toUpperCase()} - ${t.priority.toUpperCase()})`}
                      >
                        <div className="calendar-task-title truncate text-[11px] font-medium leading-tight">
                          {t.title}
                        </div>
                        <div className="calendar-task-meta flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-secondary truncate max-w-[70px]">
                            {t.project?.name || 'Project'}
                          </span>
                          {t.is_overdue && (
                            <span className="overdue-dot text-[9px] text-danger font-bold">!</span>
                          )}
                        </div>
                      </Link>
                    ))}

                    {extraCount > 0 && (
                      <button
                        type="button"
                        className="more-tasks-btn text-[10px] text-primary font-medium hover:underline text-left px-1 mt-0.5"
                        onClick={() => setExpandedDayData({ dateString: cell.dateString, tasks: dayTasks })}
                      >
                        +{extraCount} more...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* LIST / SCHEDULE VIEW */
        <Card className="calendar-list-card p-4">
          <div className="section-header mb-4">
            <h3 className="text-base font-bold text-main">
              Timeline Deadlines for {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <p className="text-xs text-secondary">
              Chronological schedule of tasks due in the active workspace.
            </p>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-schedule-box text-center py-12">
              <div className="empty-icon text-3xl mb-2">📅</div>
              <p className="text-base font-semibold text-main">No deadlines scheduled</p>
              <p className="text-xs text-secondary mt-1 max-w-md mx-auto">
                {hasActiveFilters
                  ? 'No tasks matched your active filter criteria for this month.'
                  : 'Tasks with assigned due dates will automatically appear on this schedule.'}
              </p>
            </div>
          ) : (
            <div className="schedule-items-list divide-y divide-light">
              {tasks.map((t) => (
                <div key={t.id} className="schedule-item-row py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="schedule-item-left flex items-start gap-3">
                    <div className="date-badge-box text-center min-w-[50px] p-1.5 rounded bg-slate-100 border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-secondary block">
                        {t.due_date_formatted ? new Date(t.due_date_formatted).toLocaleDateString(undefined, { month: 'short' }) : 'DATE'}
                      </span>
                      <span className="text-base font-extrabold text-main block leading-none">
                        {t.due_date_formatted ? new Date(t.due_date_formatted).getDate() : '--'}
                      </span>
                    </div>

                    <div>
                      <Link to={`/tasks/${t.id}`} className="font-semibold text-sm text-main hover:text-primary hover:underline">
                        {t.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-xs text-secondary">
                        <span>📁 {t.project?.name || 'Project'}</span>
                        {t.team && <span>• 👥 {t.team.name}</span>}
                        {t.due_time_formatted && <span>• ⏰ {t.due_time_formatted}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="schedule-item-right flex items-center gap-2">
                    {t.is_overdue && (
                      <Badge variant="danger">OVERDUE</Badge>
                    )}
                    {t.is_today && (
                      <Badge variant="primary">DUE TODAY</Badge>
                    )}
                    <Badge variant={getStatusBadgeVariant(t.status)}>
                      {t.status.toUpperCase()}
                    </Badge>
                    <Badge variant={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warning' : 'neutral'}>
                      {t.priority.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Expanded Day Tasks Modal */}
      {expandedDayData && (
        <div className="modal-backdrop">
          <div className="modal-dialog card modal-dialog-md">
            <div className="modal-header flex items-center justify-between p-4 border-b border-light">
              <h3 className="modal-title font-semibold text-base">
                Deadlines for {new Date(expandedDayData.dateString).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setExpandedDayData(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div className="modal-body p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {expandedDayData.tasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  className="block p-3 rounded border border-light hover:border-primary transition-colors bg-white"
                  onClick={() => setExpandedDayData(null)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-main">{t.title}</span>
                    <Badge variant={getStatusBadgeVariant(t.status)}>{t.status.toUpperCase()}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-secondary">
                    <span>📁 {t.project?.name || 'Project'}</span>
                    <span className="capitalize">{t.priority} Priority</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="modal-footer p-3 border-t border-light flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setExpandedDayData(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
