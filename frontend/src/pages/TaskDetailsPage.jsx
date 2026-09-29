import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import taskService from '../services/taskService';
import projectService from '../services/projectService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

export const TaskDetailsPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectMembers, setProjectMembers] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    assignees: [],
  });
  const [isOverdue, setIsOverdue] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let ignore = false;

    taskService
      .getTask(taskId)
      .then((res) => {
        if (!ignore) {
          if (res.success && res.data) {
            setTask(res.data);
            const overdue =
              res.data.due_date &&
              res.data.status !== 'done' &&
              new Date(res.data.due_date).getTime() < Date.now();
            setIsOverdue(Boolean(overdue));
          } else {
            setErrorMessage(res.message || 'Task not found.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorStatus(err.status);
          if (err.status === 403) {
            setErrorMessage('You do not have permission to view this task.');
          } else if (err.status === 404) {
            setErrorMessage('The requested task does not exist or has been removed.');
          } else {
            setErrorMessage(err.message || 'Failed to connect to server.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [taskId, refreshIndex]);

  const refreshDetails = () => {
    setIsLoading(true);
    setErrorMessage(null);
    setErrorStatus(null);
    setRefreshIndex((prev) => prev + 1);
  };

  const openEditModal = () => {
    if (!task) return;
    setFormData({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      assignees: task.assignees ? task.assignees.map((a) => a.id) : [],
    });
    setFormErrors({});
    setActionError(null);
    setIsEditModalOpen(true);

    if (task.project_id) {
      projectService
        .getProject(task.project_id)
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
    }
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setFormErrors({});
    setActionError(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    setFormErrors({});

    if (!formData.title.trim()) {
      setFormErrors({ title: ['Task title is required.'] });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date ? `${formData.due_date} 23:59:59` : null,
        assignees: formData.assignees,
      };

      await taskService.updateTask(task.id, payload);
      closeEditModal();
      refreshDetails();
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      }
      setActionError(err.message || 'Failed to update task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this task?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await taskService.deleteTask(task.id);
      navigate('/tasks');
    } catch (err) {
      alert(err.message || 'Failed to delete task.');
      setIsDeleting(false);
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

  if (isLoading) {
    return (
      <div className="task-details-loading-container">
        <Card className="loading-card">
          <div className="loading-skeleton-container">
            <div className="loading-spinner" />
            <p className="loading-text">Loading task details...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (errorMessage || !task) {
    return (
      <div className="task-details-error-container">
        <Link to="/tasks" className="back-link">
          ← Back to Tasks
        </Link>
        <Card className="error-card">
          <div className="error-state">
            <div className="error-icon" aria-hidden="true">
              {errorStatus === 403 ? '🔒' : '⚠️'}
            </div>
            <h2 className="error-title">
              {errorStatus === 403 ? 'Access Restricted' : errorStatus === 404 ? 'Task Not Found' : 'Error'}
            </h2>
            <p className="error-message">{errorMessage}</p>
            <div className="error-actions">
              <Button variant="outline" size="sm" onClick={() => navigate('/tasks')}>
                Back to Tasks
              </Button>
              <Button variant="primary" size="sm" onClick={refreshDetails}>
                Try Again
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="task-details-page">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="task-details-header">
        <div>
          <Link to="/tasks" className="back-link">
            ← Back to Tasks
          </Link>
          <div className="task-title-group">
            <h1 className="task-main-title">{task.title}</h1>
            <div className="task-badges-row">
              <Badge variant={getStatusBadgeVariant(task.status)}>
                {formatStatusText(task.status)}
              </Badge>
              <Badge variant={getPriorityBadgeVariant(task.priority)}>
                {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
              </Badge>
              {isOverdue && (
                <Badge variant="danger">
                  ⚠️ Overdue
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="task-details-actions">
          <Button variant="outline" size="sm" onClick={openEditModal} id="btn-edit-task">
            ✏️ Edit Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteTask}
            disabled={isDeleting}
            id="btn-delete-task"
            className="btn-danger-outline"
          >
            {isDeleting ? 'Deleting...' : '🗑️ Delete'}
          </Button>
        </div>
      </div>

      {/* Main Grid: Content + Meta Sidebar */}
      <div className="task-details-grid">
        {/* Left Column: Description & Primary Information */}
        <div className="task-details-main">
          <Card className="task-section-card">
            <h2 className="section-title">Description</h2>
            {task.description ? (
              <div className="task-description-body">
                <p>{task.description}</p>
              </div>
            ) : (
              <p className="text-muted text-sm">No description provided for this task.</p>
            )}
          </Card>

          {/* Project Details Banner */}
          {task.project && (
            <Card className="task-section-card">
              <h2 className="section-title">Project Association</h2>
              <div className="task-project-banner">
                <div>
                  <h3 className="project-banner-title">
                    <Link to={`/projects/${task.project.id}`}>
                      {task.project.name}
                    </Link>
                  </h3>
                  <p className="project-banner-sub">
                    Status: <span className="text-capitalize">{task.project.status || 'Active'}</span>
                    {task.project.workspace && ` • Workspace: ${task.project.workspace.name}`}
                  </p>
                </div>
                <Link to={`/projects/${task.project.id}`}>
                  <Button variant="outline" size="sm">
                    View Project →
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Metadata Sidebar */}
        <div className="task-details-sidebar">
          <Card className="task-meta-card">
            <h2 className="section-title">Details & Assignments</h2>

            <div className="meta-list">
              {/* Status */}
              <div className="meta-item">
                <span className="meta-label">Status</span>
                <span className="meta-value">
                  <Badge variant={getStatusBadgeVariant(task.status)}>
                    {formatStatusText(task.status)}
                  </Badge>
                </span>
              </div>

              {/* Priority */}
              <div className="meta-item">
                <span className="meta-label">Priority</span>
                <span className="meta-value">
                  <Badge variant={getPriorityBadgeVariant(task.priority)}>
                    {task.priority ? task.priority.toUpperCase() : 'MEDIUM'}
                  </Badge>
                </span>
              </div>

              {/* Due Date */}
              <div className="meta-item">
                <span className="meta-label">Due Date</span>
                <span className={`meta-value ${isOverdue ? 'text-danger font-semibold' : ''}`}>
                  {task.due_date ? task.due_date.slice(0, 10) : 'None'}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>

              {/* Creator */}
              <div className="meta-item">
                <span className="meta-label">Created By</span>
                <span className="meta-value">
                  {task.creator ? (
                    <span title={task.creator.email}>
                      👤 {task.creator.name}
                    </span>
                  ) : (
                    'System'
                  )}
                </span>
              </div>

              {/* Assignees */}
              <div className="meta-item assignees-meta-item">
                <span className="meta-label">Assignees</span>
                <div className="meta-assignees-list">
                  {task.assignees && task.assignees.length > 0 ? (
                    task.assignees.map((assignee) => (
                      <div key={assignee.id} className="assignee-row" title={assignee.email}>
                        <span className="assignee-avatar">👤</span>
                        <div className="assignee-text">
                          <span className="assignee-name">{assignee.name}</span>
                          <span className="assignee-email">{assignee.email}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted text-sm">No assignees assigned.</span>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="meta-item">
                <span className="meta-label">Created</span>
                <span className="meta-value text-xs text-muted">
                  {task.created_at ? new Date(task.created_at).toLocaleString() : '—'}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Last Updated</span>
                <span className="meta-value text-xs text-muted">
                  {task.updated_at ? new Date(task.updated_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-task-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="edit-task-modal-title" className="modal-title">Edit Task</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeEditModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {actionError && (
                  <div className="form-error-banner" role="alert">
                    {actionError}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="edit-task-title" className="form-label">
                    Task Title <span className="text-danger">*</span>
                  </label>
                  <input
                    id="edit-task-title"
                    type="text"
                    name="title"
                    required
                    className={`form-input ${formErrors.title ? 'input-error' : ''}`}
                    value={formData.title}
                    onChange={handleFormChange}
                  />
                  {formErrors.title && (
                    <span className="form-error-msg">{formErrors.title[0]}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="edit-task-description" className="form-label">Description</label>
                  <textarea
                    id="edit-task-description"
                    name="description"
                    rows="3"
                    className={`form-textarea ${formErrors.description ? 'input-error' : ''}`}
                    value={formData.description}
                    onChange={handleFormChange}
                  />
                  {formErrors.description && (
                    <span className="form-error-msg">{formErrors.description[0]}</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-task-status" className="form-label">Status</label>
                    <select
                      id="edit-task-status"
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
                    <label htmlFor="edit-task-priority" className="form-label">Priority</label>
                    <select
                      id="edit-task-priority"
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

                <div className="form-group">
                  <label htmlFor="edit-task-due-date" className="form-label">Due Date</label>
                  <input
                    id="edit-task-due-date"
                    type="date"
                    name="due_date"
                    className="form-input"
                    value={formData.due_date}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Assignees</label>
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
                </div>
              </div>

              <div className="modal-footer">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeEditModal}
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
                  {isSubmitting ? 'Saving...' : 'Update Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetailsPage;
