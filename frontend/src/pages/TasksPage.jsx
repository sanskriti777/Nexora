import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import taskService from '../services/taskService';
import projectService from '../services/projectService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'In Review' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest First' },
  { value: 'created_at:asc', label: 'Oldest First' },
  { value: 'due_date:asc', label: 'Due Date (Earliest)' },
  { value: 'due_date:desc', label: 'Due Date (Latest)' },
  { value: 'title:asc', label: 'Title (A to Z)' },
  { value: 'title:desc', label: 'Title (Z to A)' },
  { value: 'priority:desc', label: 'Priority' },
];

export const TasksPage = () => {
  const [tasks, setTasks] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 20 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortSelection, setSortSelection] = useState('created_at:desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    assignees: [],
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // 1. Fetch available projects for filter dropdown and task creation
  useEffect(() => {
    let ignore = false;
    projectService
      .getProjects({ per_page: 100 })
      .then((res) => {
        if (!ignore && res.success) {
          setProjectsList(res.data || []);
        }
      })
      .catch(() => {
        // Silently tolerate if projects fails to fetch in background
      });

    return () => {
      ignore = true;
    };
  }, []);

  // 2. Fetch tasks matching current filters
  useEffect(() => {
    let ignore = false;
    const [sortBy, sortDirection] = sortSelection.split(':');

    taskService
      .getTasks({
        search: search.trim() || undefined,
        project_id: projectFilter || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        sort_by: sortBy,
        sort_direction: sortDirection,
        page: currentPage,
        per_page: 20,
      })
      .then((res) => {
        if (!ignore) {
          if (res.success) {
            setTasks(res.data || []);
            if (res.meta) {
              setMeta(res.meta);
            }
          } else {
            setErrorMessage(res.message || 'Failed to fetch tasks.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err.message || 'Unable to connect to server. Please check your connection.');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [search, projectFilter, statusFilter, priorityFilter, sortSelection, currentPage, refreshIndex]);

  // Load project members when project selection changes in modal
  const loadProjectMembers = useCallback((projId) => {
    if (!projId) {
      setProjectMembers([]);
      return;
    }
    projectService
      .getProject(projId)
      .then((res) => {
        if (res.success && res.data) {
          const members = [];
          if (res.data.owner) {
            members.push({ id: res.data.owner.id, name: `${res.data.owner.name} (Owner)` });
          }
          if (Array.isArray(res.data.members)) {
            res.data.members.forEach((m) => {
              if (!members.some((existing) => existing.id === m.id)) {
                members.push({ id: m.id, name: m.name });
              }
            });
          }
          setProjectMembers(members);
        }
      })
      .catch(() => {
        setProjectMembers([]);
      });
  }, []);

  const refreshTasks = () => {
    setIsLoading(true);
    setRefreshIndex((prev) => prev + 1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleProjectFilterChange = (e) => {
    setProjectFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handlePriorityFilterChange = (e) => {
    setPriorityFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    setSortSelection(e.target.value);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setProjectFilter('');
    setStatusFilter('');
    setPriorityFilter('');
    setSortSelection('created_at:desc');
    setCurrentPage(1);
  };

  const openCreateModal = () => {
    const defaultProjectId = projectsList.length > 0 ? String(projectsList[0].id) : '';
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      project_id: defaultProjectId,
      status: 'todo',
      priority: 'medium',
      due_date: '',
      assignees: [],
    });
    setFormErrors({});
    setActionError(null);
    setIsModalOpen(true);
    if (defaultProjectId) {
      loadProjectMembers(defaultProjectId);
    }
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    const projId = String(task.project_id);
    setFormData({
      title: task.title || '',
      description: task.description || '',
      project_id: projId,
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      assignees: task.assignees ? task.assignees.map((a) => a.id) : [],
    });
    setFormErrors({});
    setActionError(null);
    setIsModalOpen(true);
    loadProjectMembers(projId);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setFormErrors({});
    setActionError(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'project_id') {
      setFormData((prev) => ({ ...prev, project_id: value, assignees: [] }));
      loadProjectMembers(value);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleAssigneeToggle = (userId) => {
    setFormData((prev) => {
      const exists = prev.assignees.includes(userId);
      const updated = exists
        ? prev.assignees.filter((id) => id !== userId)
        : [...prev.assignees, userId];
      return { ...prev, assignees: updated };
    });
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    setFormErrors({});

    // Client-side quick checks
    const errors = {};
    if (!formData.title.trim()) errors.title = ['Task title is required.'];
    if (!formData.project_id) errors.project_id = ['Please select a project.'];
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: parseInt(formData.project_id, 10),
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date ? `${formData.due_date} 23:59:59` : null,
        assignees: formData.assignees,
      };

      if (editingTask) {
        await taskService.updateTask(editingTask.id, payload);
      } else {
        await taskService.createTask(payload);
      }

      closeModal();
      refreshTasks();
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      }
      setActionError(err.message || 'Failed to save task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    setDeletingTaskId(taskId);
    try {
      await taskService.deleteTask(taskId);
      refreshTasks();
    } catch (err) {
      alert(err.message || 'Failed to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'done':
        return 'success';
      case 'in_progress':
        return 'primary';
      case 'review':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getPriorityBadgeVariant = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'primary';
      default:
        return 'neutral';
    }
  };

  const formatStatusText = (status) => {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'review':
        return 'Review';
      case 'todo':
        return 'To Do';
      case 'done':
        return 'Done';
      default:
        return status;
    }
  };

  return (
    <div className="tasks-page-container">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Manage, track, and prioritize action items across your workspace projects.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="primary" onClick={openCreateModal} id="btn-create-task">
            + Create Task
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="filter-card">
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search tasks by title or description..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search tasks"
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-selects-group">
            {/* Project Filter */}
            <select
              className="select-filter"
              value={projectFilter}
              onChange={handleProjectFilterChange}
              aria-label="Filter by project"
            >
              <option value="">All Projects</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="select-filter"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Priority Filter */}
            <select
              className="select-filter"
              value={priorityFilter}
              onChange={handlePriorityFilterChange}
              aria-label="Filter by priority"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Sorting */}
            <select
              className="select-filter"
              value={sortSelection}
              onChange={handleSortChange}
              aria-label="Sort tasks"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Content Area */}
      {errorMessage ? (
        <Card className="error-card">
          <div className="error-state">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h2 className="error-title">Unable to Load Tasks</h2>
            <p className="error-message">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={refreshTasks}>
              Retry Connection
            </Button>
          </div>
        </Card>
      ) : isLoading ? (
        <Card className="loading-card">
          <div className="loading-skeleton-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading workspace tasks...</p>
          </div>
        </Card>
      ) : tasks.length === 0 ? (
        <Card className="empty-card">
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">✓</div>
            <h2 className="empty-title">No tasks found</h2>
            <p className="empty-subtext">
              {search || projectFilter || statusFilter || priorityFilter
                ? 'No tasks matched your active search and filter criteria.'
                : 'Get started by creating your first task for a project.'}
            </p>
            <div className="empty-actions">
              {search || projectFilter || statusFilter || priorityFilter ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear Filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={openCreateModal}>
                  + Create First Task
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <div className="tasks-table-wrapper">
          <div className="table-responsive">
            <table className="projects-table tasks-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Assignees</th>
                  <th scope="col">Due Date</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="project-row task-row">
                    {/* Task Title & Details */}
                    <td className="project-name-cell">
                      <Link to={`/tasks/${task.id}`} className="project-title-link">
                        {task.title}
                      </Link>
                      {task.description && (
                        <p className="project-desc-snippet" title={task.description}>
                          {task.description}
                        </p>
                      )}
                    </td>

                    {/* Project */}
                    <td>
                      {task.project ? (
                        <Link
                          to={`/projects/${task.project.id}`}
                          className="task-project-link text-sm font-medium"
                        >
                          {task.project.name}
                        </Link>
                      ) : (
                        <span className="text-muted text-sm">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      <Badge variant={getStatusBadgeVariant(task.status)}>
                        {formatStatusText(task.status)}
                      </Badge>
                    </td>

                    {/* Priority */}
                    <td>
                      <Badge variant={getPriorityBadgeVariant(task.priority)}>
                        {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
                      </Badge>
                    </td>

                    {/* Assignees */}
                    <td>
                      {task.assignees && task.assignees.length > 0 ? (
                        <div className="task-assignees-pill" title={task.assignees.map((a) => a.name).join(', ')}>
                          <span className="assignee-avatar-icon">👤</span>
                          <span className="text-sm">
                            {task.assignees.length === 1
                              ? task.assignees[0].name
                              : `${task.assignees[0].name} +${task.assignees.length - 1}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">Unassigned</span>
                      )}
                    </td>

                    {/* Due Date */}
                    <td>
                      <span className="due-date-text">
                        {task.due_date ? task.due_date.slice(0, 10) : 'No due date'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="text-right actions-cell">
                      <Link to={`/tasks/${task.id}`} className="btn-table-action" title="View details">
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => openEditModal(task)}
                        title="Edit task"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-table-action danger"
                        onClick={() => handleDeleteTask(task.id)}
                        disabled={deletingTaskId === task.id}
                        title="Delete task"
                      >
                        {deletingTaskId === task.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="projects-pagination">
            <span className="pagination-info">
              Showing {tasks.length} of {meta.total} tasks (Page {meta.current_page} of {meta.last_page})
            </span>
            <div className="pagination-buttons">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || isLoading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= meta.last_page || isLoading}
                onClick={() => setCurrentPage((p) => Math.min(meta.last_page, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="task-modal-title" className="modal-title">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="modal-body">
                {actionError && (
                  <div className="form-error-banner" role="alert">
                    {actionError}
                  </div>
                )}

                {/* Project Selection */}
                <div className="form-group">
                  <label htmlFor="task-project" className="form-label">
                    Project <span className="text-danger">*</span>
                  </label>
                  <select
                    id="task-project"
                    name="project_id"
                    required
                    className={`form-select ${formErrors.project_id ? 'input-error' : ''}`}
                    value={formData.project_id}
                    onChange={handleFormChange}
                  >
                    <option value="">Select a project...</option>
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.project_id && (
                    <span className="form-error-msg">{formErrors.project_id[0]}</span>
                  )}
                </div>

                {/* Title */}
                <div className="form-group">
                  <label htmlFor="task-title" className="form-label">
                    Task Title <span className="text-danger">*</span>
                  </label>
                  <input
                    id="task-title"
                    type="text"
                    name="title"
                    required
                    className={`form-input ${formErrors.title ? 'input-error' : ''}`}
                    placeholder="e.g. Implement OAuth login provider"
                    value={formData.title}
                    onChange={handleFormChange}
                  />
                  {formErrors.title && (
                    <span className="form-error-msg">{formErrors.title[0]}</span>
                  )}
                </div>

                {/* Description */}
                <div className="form-group">
                  <label htmlFor="task-description" className="form-label">Description</label>
                  <textarea
                    id="task-description"
                    name="description"
                    rows="3"
                    className={`form-textarea ${formErrors.description ? 'input-error' : ''}`}
                    placeholder="Provide details, acceptance criteria, or technical notes..."
                    value={formData.description}
                    onChange={handleFormChange}
                  />
                  {formErrors.description && (
                    <span className="form-error-msg">{formErrors.description[0]}</span>
                  )}
                </div>

                {/* Status & Priority Row */}
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="task-status" className="form-label">Status</label>
                    <select
                      id="task-status"
                      name="status"
                      className="form-select"
                      value={formData.status}
                      onChange={handleFormChange}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="task-priority" className="form-label">Priority</label>
                    <select
                      id="task-priority"
                      name="priority"
                      className="form-select"
                      value={formData.priority}
                      onChange={handleFormChange}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                {/* Due Date */}
                <div className="form-group">
                  <label htmlFor="task-due-date" className="form-label">Due Date</label>
                  <input
                    id="task-due-date"
                    type="date"
                    name="due_date"
                    className="form-input"
                    value={formData.due_date}
                    onChange={handleFormChange}
                  />
                </div>

                {/* Assignees Selection */}
                <div className="form-group">
                  <label className="form-label">Assignees</label>
                  {projectMembers.length === 0 ? (
                    <p className="text-muted text-xs">
                      {formData.project_id
                        ? 'No members registered for this project.'
                        : 'Select a project first to view and assign members.'}
                    </p>
                  ) : (
                    <div className="assignees-checkbox-grid">
                      {projectMembers.map((member) => (
                        <label key={member.id} className="assignee-checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.assignees.includes(member.id)}
                            onChange={() => handleAssigneeToggle(member.id)}
                          />
                          <span>{member.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
