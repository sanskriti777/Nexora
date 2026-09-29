import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import taskService from '../services/taskService';
import projectService from '../services/projectService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

const COLUMNS = [
  { id: 'todo', title: 'To Do', emptyMessage: 'No tasks yet', badgeVariant: 'neutral' },
  { id: 'in_progress', title: 'In Progress', emptyMessage: 'No tasks in progress', badgeVariant: 'primary' },
  { id: 'review', title: 'Review', emptyMessage: 'No tasks under review', badgeVariant: 'warning' },
  { id: 'done', title: 'Done', emptyMessage: 'No completed tasks yet', badgeVariant: 'success' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const KanbanPage = () => {
  const [tasks, setTasks] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [feedbackNotice, setFeedbackNotice] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Drag & Drop State
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [activeDropColumn, setActiveDropColumn] = useState(null);
  const [isUpdatingTaskId, setIsUpdatingTaskId] = useState(null);

  // Create Task Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState('todo');
  const [projectMembers, setProjectMembers] = useState([]);
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
  const [modalActionError, setModalActionError] = useState(null);

  // 1. Fetch available projects for dropdown
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

  // 2. Fetch tasks for Kanban board
  useEffect(() => {
    let ignore = false;

    taskService
      .getTasks({
        search: search.trim() || undefined,
        project_id: projectFilter || undefined,
        priority: priorityFilter || undefined,
        per_page: 100,
        sort_by: 'created_at',
        sort_direction: 'desc',
      })
      .then((res) => {
        if (!ignore) {
          if (res.success) {
            setTasks(res.data || []);
          } else {
            setErrorMessage(res.message || 'Failed to load Kanban tasks.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err.message || 'Unable to connect to server.');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [search, projectFilter, priorityFilter, refreshIndex]);

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

  const refreshBoard = () => {
    setIsLoading(true);
    setErrorMessage(null);
    setFeedbackNotice(null);
    setRefreshIndex((prev) => prev + 1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  const handleProjectFilterChange = (e) => {
    setProjectFilter(e.target.value);
  };

  const handlePriorityFilterChange = (e) => {
    setPriorityFilter(e.target.value);
  };

  const clearFilters = () => {
    setSearch('');
    setProjectFilter('');
    setPriorityFilter('');
  };

  // ==========================================
  // NATIVE HTML5 DRAG AND DROP
  // ==========================================

  const handleDragStart = (e, task) => {
    setDraggedTaskId(task.id);
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setActiveDropColumn(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropColumn !== columnId) {
      setActiveDropColumn(columnId);
    }
  };

  const handleDragLeave = (e, columnId) => {
    // Only reset if leaving the column element itself
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (activeDropColumn === columnId) {
      setActiveDropColumn(null);
    }
  };

  const handleDrop = async (e, targetColumnId) => {
    e.preventDefault();
    setActiveDropColumn(null);

    const taskIdStr = e.dataTransfer.getData('text/plain') || String(draggedTaskId);
    const taskId = parseInt(taskIdStr, 10);
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) {
      return; // No status change needed
    }

    const previousStatus = task.status;

    // 1. Optimistic UI update
    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === taskId ? { ...t, status: targetColumnId } : t))
    );

    setIsUpdatingTaskId(taskId);
    setFeedbackNotice(null);

    // 2. Call authorized backend API
    try {
      await taskService.updateTask(taskId, { status: targetColumnId });
      setFeedbackNotice({
        type: 'success',
        message: `Task moved to ${COLUMNS.find((c) => c.id === targetColumnId)?.title}.`,
      });
      // Clear notice after 3 seconds
      setTimeout(() => setFeedbackNotice(null), 3000);
    } catch (err) {
      // 3. Rollback optimistic move on error
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t))
      );
      setFeedbackNotice({
        type: 'error',
        message: err.message || 'Failed to update task status. Changes were reverted.',
      });
    } finally {
      setIsUpdatingTaskId(null);
      setDraggedTaskId(null);
    }
  };

  // Accessible non-drag status change handler
  const handleQuickStatusChange = async (taskId, targetColumnId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;

    const previousStatus = task.status;

    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === taskId ? { ...t, status: targetColumnId } : t))
    );

    setIsUpdatingTaskId(taskId);
    setFeedbackNotice(null);

    try {
      await taskService.updateTask(taskId, { status: targetColumnId });
      setFeedbackNotice({
        type: 'success',
        message: `Task moved to ${COLUMNS.find((c) => c.id === targetColumnId)?.title}.`,
      });
      setTimeout(() => setFeedbackNotice(null), 3000);
    } catch (err) {
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t))
      );
      setFeedbackNotice({
        type: 'error',
        message: err.message || 'Failed to move task. Reverted.',
      });
    } finally {
      setIsUpdatingTaskId(null);
    }
  };

  // ==========================================
  // CREATE TASK MODAL
  // ==========================================

  const openCreateModal = (defaultStatus = 'todo') => {
    const defaultProjectId =
      projectFilter || (projectsList.length > 0 ? String(projectsList[0].id) : '');

    setModalDefaultStatus(defaultStatus);
    setFormData({
      title: '',
      description: '',
      project_id: defaultProjectId,
      status: defaultStatus,
      priority: 'medium',
      due_date: '',
      assignees: [],
    });
    setFormErrors({});
    setModalActionError(null);
    setIsCreateModalOpen(true);

    if (defaultProjectId) {
      loadProjectMembers(defaultProjectId);
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setFormErrors({});
    setModalActionError(null);
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
    setModalActionError(null);
    setFormErrors({});

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

      await taskService.createTask(payload);
      closeCreateModal();
      refreshBoard();
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      }
      setModalActionError(err.message || 'Failed to create task.');
    } finally {
      setIsSubmitting(false);
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

  const hasActiveFilters = Boolean(search || projectFilter || priorityFilter);

  return (
    <div className="kanban-page-container">
      {/* Board Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Kanban Board</h1>
          <p className="page-subtitle">
            Visual task lifecycle across To Do, In Progress, Review, and Done. Drag cards to update status.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="outline" size="sm" onClick={refreshBoard} title="Refresh board">
            🔄 Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => openCreateModal('todo')}
            id="btn-kanban-create-task"
          >
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
              placeholder="Search tasks on board..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search board tasks"
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
              aria-label="Filter board by project"
            >
              <option value="">All Projects</option>
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Priority Filter */}
            <select
              className="select-filter"
              value={priorityFilter}
              onChange={handlePriorityFilterChange}
              aria-label="Filter board by priority"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Feedback Toast / Banner */}
      {feedbackNotice && (
        <div
          className={`kanban-feedback-banner ${feedbackNotice.type === 'error' ? 'error' : 'success'}`}
          role="status"
          aria-live="polite"
        >
          <span>{feedbackNotice.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{feedbackNotice.message}</span>
        </div>
      )}

      {/* Main Content: Loading, Error, or Board */}
      {errorMessage ? (
        <Card className="error-card">
          <div className="error-state">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h2 className="error-title">Unable to Load Kanban Board</h2>
            <p className="error-message">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={refreshBoard}>
              Retry Connection
            </Button>
          </div>
        </Card>
      ) : isLoading ? (
        <Card className="loading-card">
          <div className="loading-skeleton-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading Kanban board...</p>
          </div>
        </Card>
      ) : projectsList.length === 0 ? (
        /* Workspace has no projects yet */
        <Card className="empty-card">
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">📋</div>
            <h2 className="empty-title">No Projects Found</h2>
            <p className="empty-subtext">
              A project is required before tasks can be created and organized on the Kanban board.
            </p>
            <div className="empty-actions">
              <Link to="/projects">
                <Button variant="primary" size="sm">
                  Go to Projects
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        /* The Four Kanban Columns Board */
        <div className="kanban-board-container">
          <div className="kanban-board-grid">
            {COLUMNS.map((column) => {
              const columnTasks = tasks.filter((t) => t.status === column.id);
              const isDropTargetActive = activeDropColumn === column.id;

              return (
                <div
                  key={column.id}
                  className={`kanban-column ${isDropTargetActive ? 'column-drop-active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={(e) => handleDragLeave(e, column.id)}
                  onDrop={(e) => handleDrop(e, column.id)}
                  data-column-id={column.id}
                >
                  {/* Column Header */}
                  <div className="kanban-column-header">
                    <div className="column-title-group">
                      <span className={`column-status-indicator status-${column.id}`} />
                      <h2 className="column-title">{column.title}</h2>
                      <span className="column-count-badge">{columnTasks.length}</span>
                    </div>

                    <button
                      type="button"
                      className="column-add-btn"
                      onClick={() => openCreateModal(column.id)}
                      title={`Add task to ${column.title}`}
                      aria-label={`Add task to ${column.title}`}
                    >
                      +
                    </button>
                  </div>

                  {/* Column Drop Area & Cards */}
                  <div className="kanban-cards-list">
                    {columnTasks.length === 0 ? (
                      <div className="kanban-empty-column">
                        <p className="empty-column-text">{column.emptyMessage}</p>
                        <button
                          type="button"
                          className="empty-column-action"
                          onClick={() => openCreateModal(column.id)}
                        >
                          + Add Task
                        </button>
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const isDragging = draggedTaskId === task.id;
                        const isUpdating = isUpdatingTaskId === task.id;

                        return (
                          <div
                            key={task.id}
                            className={`kanban-card ${isDragging ? 'is-dragging' : ''} ${isUpdating ? 'is-updating' : ''}`}
                            draggable={!isUpdating}
                            onDragStart={(e) => handleDragStart(e, task)}
                            onDragEnd={handleDragEnd}
                            role="article"
                            aria-label={`Task: ${task.title}`}
                          >
                            {/* Card Top: Project & Priority */}
                            <div className="kanban-card-top">
                              {task.project ? (
                                <Link
                                  to={`/projects/${task.project.id}`}
                                  className="kanban-card-project text-xs font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                  title={`Project: ${task.project.name}`}
                                >
                                  📁 {task.project.name}
                                </Link>
                              ) : (
                                <span className="text-muted text-xs">General</span>
                              )}

                              <Badge
                                variant={getPriorityBadgeVariant(task.priority)}
                                className="kanban-priority-badge"
                              >
                                {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
                              </Badge>
                            </div>

                            {/* Card Title (Click to view details) */}
                            <h3 className="kanban-card-title">
                              <Link to={`/tasks/${task.id}`} className="kanban-card-title-link">
                                {task.title}
                              </Link>
                            </h3>

                            {/* Card Description Snippet */}
                            {task.description && (
                              <p className="kanban-card-desc" title={task.description}>
                                {task.description}
                              </p>
                            )}

                            {/* Card Footer: Assignees, Due Date, and Accessible Move Menu */}
                            <div className="kanban-card-footer">
                              <div className="kanban-card-meta">
                                {task.assignees && task.assignees.length > 0 ? (
                                  <div
                                    className="kanban-assignees-pill"
                                    title={task.assignees.map((a) => a.name).join(', ')}
                                  >
                                    <span className="assignee-avatar-icon">👤</span>
                                    <span className="text-xs">
                                      {task.assignees.length === 1
                                        ? task.assignees[0].name.split(' ')[0]
                                        : `${task.assignees[0].name.split(' ')[0]} +${task.assignees.length - 1}`}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted text-xs">Unassigned</span>
                                )}

                                {task.due_date && (
                                  <span
                                    className="kanban-card-due text-xs text-muted"
                                    title={`Due date: ${task.due_date.slice(0, 10)}`}
                                  >
                                    📅 {task.due_date.slice(5, 10)}
                                  </span>
                                )}
                              </div>

                              {/* Accessible quick status selector */}
                              <div className="kanban-card-actions">
                                <select
                                  className="kanban-quick-move-select"
                                  value={task.status}
                                  onChange={(e) => handleQuickStatusChange(task.id, e.target.value)}
                                  aria-label="Move task status"
                                  title="Quick move task"
                                  disabled={isUpdating}
                                >
                                  <option value="todo">To Do</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="review">Review</option>
                                  <option value="done">Done</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kanban-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="kanban-modal-title" className="modal-title">
                Create New Task ({COLUMNS.find((c) => c.id === modalDefaultStatus)?.title || 'To Do'})
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeCreateModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="modal-body">
                {modalActionError && (
                  <div className="form-error-banner" role="alert">
                    {modalActionError}
                  </div>
                )}

                {/* Project Selection */}
                <div className="form-group">
                  <label htmlFor="kanban-task-project" className="form-label">
                    Project <span className="text-danger">*</span>
                  </label>
                  <select
                    id="kanban-task-project"
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
                  <label htmlFor="kanban-task-title" className="form-label">
                    Task Title <span className="text-danger">*</span>
                  </label>
                  <input
                    id="kanban-task-title"
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
                  <label htmlFor="kanban-task-desc" className="form-label">Description</label>
                  <textarea
                    id="kanban-task-desc"
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
                    <label htmlFor="kanban-task-status" className="form-label">Status</label>
                    <select
                      id="kanban-task-status"
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
                    <label htmlFor="kanban-task-priority" className="form-label">Priority</label>
                    <select
                      id="kanban-task-priority"
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
                  <label htmlFor="kanban-task-due" className="form-label">Due Date</label>
                  <input
                    id="kanban-task-due"
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
                  onClick={closeCreateModal}
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
                  {isSubmitting ? 'Saving...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanPage;
