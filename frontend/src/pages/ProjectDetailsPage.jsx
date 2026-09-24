import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import projectService from '../services/projectService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

export const ProjectDetailsPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  // Tab navigation
  const [activeTab, setActiveTab] = useState('overview');

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planning',
    priority: 'medium',
    start_date: '',
    due_date: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let ignore = false;

    projectService
      .getProject(projectId)
      .then((res) => {
        if (!ignore) {
          if (res.success && res.data) {
            setProject(res.data);
          } else {
            setErrorMessage(res.message || 'Project not found.');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorStatus(err.status);
          if (err.status === 403) {
            setErrorMessage('You do not have permission to view this project.');
          } else if (err.status === 404) {
            setErrorMessage('The requested project does not exist or has been removed.');
          } else {
            setErrorMessage(err.message || 'Failed to connect to server.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [projectId, refreshIndex]);

  const refreshProjectDetails = () => {
    setIsLoading(true);
    setErrorMessage(null);
    setErrorStatus(null);
    setRefreshIndex((prev) => prev + 1);
  };

  const openEditModal = () => {
    if (!project) return;
    setFormData({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'planning',
      priority: project.priority || 'medium',
      start_date: project.start_date || '',
      due_date: project.due_date || '',
    });
    setFormErrors({});
    setActionError(null);
    setIsEditModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors({});
    setActionError(null);

    try {
      const res = await projectService.updateProject(projectId, formData);
      if (res.success) {
        setIsEditModalOpen(false);
        refreshProjectDetails();
      }
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      } else {
        setActionError(err.message || 'Failed to update project.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this project? It will be archived.')) {
      return;
    }

    try {
      const res = await projectService.deleteProject(projectId);
      if (res.success) {
        navigate('/projects');
      }
    } catch (err) {
      alert(err.message || 'Failed to delete project.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge variant="success" dot>Active</Badge>;
      case 'completed':
        return <Badge variant="primary" dot>Completed</Badge>;
      case 'on_hold':
        return <Badge variant="warning" dot>On Hold</Badge>;
      case 'archived':
        return <Badge variant="neutral">Archived</Badge>;
      case 'planning':
      default:
        return <Badge variant="neutral" dot>Planning</Badge>;
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="danger">Urgent</Badge>;
      case 'high':
        return <Badge variant="warning">High</Badge>;
      case 'medium':
        return <Badge variant="neutral">Medium</Badge>;
      case 'low':
      default:
        return <Badge variant="neutral">Low</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="project-details-loading card">
        <div className="skeleton-title" />
        <div className="skeleton-row" />
        <div className="skeleton-kpis">
          <div className="skeleton-kpi-card" />
          <div className="skeleton-kpi-card" />
          <div className="skeleton-kpi-card" />
          <div className="skeleton-kpi-card" />
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <Card className="dashboard-error-card">
        <div className="error-icon" aria-hidden="true">
          {errorStatus === 403 ? '🔒' : errorStatus === 404 ? '🔍' : '⚠️'}
        </div>
        <h2 className="error-title">
          {errorStatus === 403
            ? 'Access Denied'
            : errorStatus === 404
            ? 'Project Not Found'
            : 'Error Loading Project'}
        </h2>
        <p className="error-description">{errorMessage}</p>
        <div className="error-actions">
          <Link to="/projects">
            <Button variant="outline">← Back to Projects</Button>
          </Link>
          {errorStatus !== 403 && errorStatus !== 404 && (
            <Button variant="primary" onClick={refreshProjectDetails}>
              Retry
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (!project) return null;

  const stats = project.statistics || {};

  return (
    <div className="project-details-container">
      {/* Breadcrumb / Back Link */}
      <div className="project-details-nav">
        <Link to="/projects" className="back-link">
          ← Back to Projects
        </Link>
      </div>

      {/* Project Header Banner */}
      <header className="project-details-header card">
        <div className="project-details-main">
          <div className="project-title-row">
            <h1 className="project-heading">{project.name}</h1>
            <div className="project-badges">
              {getStatusBadge(project.status)}
              {getPriorityBadge(project.priority)}
            </div>
          </div>
          {project.description && (
            <p className="project-description-text">{project.description}</p>
          )}
          <div className="project-meta-strip">
            <span className="meta-item">
              <strong>Workspace:</strong> {project.workspace?.name || 'Default Workspace'}
            </span>
            <span className="meta-item">
              <strong>Owner:</strong> {project.owner?.name || 'Unassigned'}
            </span>
            {project.due_date && (
              <span className="meta-item">
                <strong>Due Date:</strong> {project.due_date}
              </span>
            )}
            <span className="meta-item">
              <strong>Created:</strong> {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>

        <div className="project-details-actions">
          <Button variant="outline" size="sm" onClick={openEditModal}>
            Edit Project
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </header>

      {/* KPI Metric Cards */}
      <div className="project-kpi-grid">
        <Card className="project-kpi-card">
          <span className="kpi-label">Total Tasks</span>
          <span className="kpi-value">{stats.total_tasks ?? 0}</span>
          <span className="kpi-desc">Across all milestones</span>
        </Card>

        <Card className="project-kpi-card">
          <span className="kpi-label">Completed Tasks</span>
          <span className="kpi-value text-success">{stats.completed_tasks ?? 0}</span>
          <span className="kpi-desc">Delivered items</span>
        </Card>

        <Card className="project-kpi-card">
          <span className="kpi-label">In Progress</span>
          <span className="kpi-value text-primary">{stats.in_progress_tasks ?? 0}</span>
          <span className="kpi-desc">Active workload</span>
        </Card>

        <Card className="project-kpi-card">
          <span className="kpi-label">Overdue Tasks</span>
          <span className={`kpi-value ${stats.overdue_tasks > 0 ? 'text-danger' : ''}`}>
            {stats.overdue_tasks ?? 0}
          </span>
          <span className="kpi-desc">Past deadline</span>
        </Card>
      </div>

      {/* Progress Bar Card */}
      <Card className="project-progress-card">
        <div className="progress-header-row">
          <span className="progress-title">Project Completion Progress</span>
          <span className="progress-percentage-label">
            {stats.progress !== null ? `${stats.progress}%` : 'No tasks assigned'}
          </span>
        </div>
        <div className="progress-bar-bg large">
          <div
            className="progress-bar-fill"
            style={{ width: `${stats.progress ? Math.min(100, Math.max(0, stats.progress)) : 0}%` }}
          />
        </div>
      </Card>

      {/* Tab Navigation */}
      <div className="project-tabs-container">
        <button
          type="button"
          className={`project-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`project-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks ({stats.total_tasks ?? 0})
        </button>
        <button
          type="button"
          className={`project-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Members ({project.members?.length ?? 0})
        </button>
        <button
          type="button"
          className={`project-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="project-overview-grid">
          {/* Recent Tasks */}
          <Card className="project-section-card">
            <h2 className="section-title">Recent Tasks</h2>
            {!project.recent_tasks || project.recent_tasks.length === 0 ? (
              <p className="empty-subtext">No tasks created for this project yet.</p>
            ) : (
              <ul className="project-task-list">
                {project.recent_tasks.map((task) => (
                  <li key={task.id} className="project-task-item">
                    <div className="task-item-main">
                      <span className="task-item-title">{task.title}</span>
                      <span className="task-item-due">
                        {task.due_date ? `Due ${task.due_date}` : 'No due date'}
                      </span>
                    </div>
                    <Badge variant={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'primary' : 'neutral'}>
                      {task.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Members & Details Panel */}
          <div className="project-sidebar-stack">
            <Card className="project-section-card">
              <h2 className="section-title">Project Members</h2>
              {!project.members || project.members.length === 0 ? (
                <p className="empty-subtext">No members assigned yet.</p>
              ) : (
                <ul className="project-member-list">
                  {project.members.map((member) => (
                    <li key={member.id} className="project-member-item">
                      <span className="member-avatar">{member.name.charAt(0).toUpperCase()}</span>
                      <div className="member-info">
                        <span className="member-name">{member.name}</span>
                        <span className="member-role">{member.role || 'Member'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="project-section-card">
              <h2 className="section-title">Recent Activity</h2>
              {!project.recent_activity || project.recent_activity.length === 0 ? (
                <p className="empty-subtext">No activity recorded yet.</p>
              ) : (
                <ul className="project-activity-list">
                  {project.recent_activity.map((act) => (
                    <li key={act.id} className="project-activity-item">
                      <span className="activity-dot" />
                      <div className="activity-content">
                        <p className="activity-action">
                          <strong>{act.user?.name || 'System'}:</strong> {act.action.replace('_', ' ')}
                        </p>
                        <span className="activity-time">
                          {act.created_at ? new Date(act.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <Card className="project-section-card">
          <h2 className="section-title">Project Tasks</h2>
          {!project.recent_tasks || project.recent_tasks.length === 0 ? (
            <div className="empty-state-inner">
              <p className="empty-subtext">No tasks found for this project.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="projects-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due Date</th>
                    <th>Assignees</th>
                  </tr>
                </thead>
                <tbody>
                  {project.recent_tasks.map((task) => (
                    <tr key={task.id}>
                      <td><strong>{task.title}</strong></td>
                      <td>
                        <Badge variant={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'primary' : 'neutral'}>
                          {task.status}
                        </Badge>
                      </td>
                      <td><Badge variant="neutral">{task.priority || 'medium'}</Badge></td>
                      <td>{task.due_date || 'No due date'}</td>
                      <td>
                        {task.assignees?.length > 0
                          ? task.assignees.map((a) => a.name).join(', ')
                          : 'Unassigned'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'members' && (
        <Card className="project-section-card">
          <h2 className="section-title">Project Team Members</h2>
          {!project.members || project.members.length === 0 ? (
            <p className="empty-subtext">No members assigned to this project yet.</p>
          ) : (
            <ul className="project-member-detailed-list">
              {project.members.map((member) => (
                <li key={member.id} className="project-member-detailed-item">
                  <div className="member-avatar-lg">{member.name.charAt(0).toUpperCase()}</div>
                  <div className="member-details">
                    <span className="member-name-lg">{member.name}</span>
                    <span className="member-email-lg">{member.email}</span>
                  </div>
                  <Badge variant="neutral">{member.role || 'Member'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card className="project-section-card">
          <h2 className="section-title">Full Project Activity Log</h2>
          {!project.recent_activity || project.recent_activity.length === 0 ? (
            <p className="empty-subtext">No project activity logged yet.</p>
          ) : (
            <ul className="project-activity-list">
              {project.recent_activity.map((act) => (
                <li key={act.id} className="project-activity-item">
                  <span className="activity-dot" />
                  <div className="activity-content">
                    <p className="activity-action">
                      <strong>{act.user?.name || 'System'}:</strong> {act.action.replace('_', ' ')}
                    </p>
                    <span className="activity-time">
                      {act.created_at ? new Date(act.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Edit Project Modal */}
      {isEditModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-details-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="edit-details-modal-title" className="modal-title">Edit Project</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEditModalOpen(false)}
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
                  <label htmlFor="edit-proj-name" className="form-label">
                    Project Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="edit-proj-name"
                    type="text"
                    name="name"
                    required
                    className={`form-input ${formErrors.name ? 'input-error' : ''}`}
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                  {formErrors.name && (
                    <span className="form-error-msg">{formErrors.name[0]}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="edit-proj-desc" className="form-label">Description</label>
                  <textarea
                    id="edit-proj-desc"
                    name="description"
                    rows="3"
                    className="form-textarea"
                    value={formData.description}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-proj-status" className="form-label">Status</label>
                    <select
                      id="edit-proj-status"
                      name="status"
                      className="form-select"
                      value={formData.status}
                      onChange={handleFormChange}
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-proj-priority" className="form-label">Priority</label>
                    <select
                      id="edit-proj-priority"
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

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-proj-start" className="form-label">Start Date</label>
                    <input
                      id="edit-proj-start"
                      type="date"
                      name="start_date"
                      className="form-input"
                      value={formData.start_date}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-proj-due" className="form-label">Due Date</label>
                    <input
                      id="edit-proj-due"
                      type="date"
                      name="due_date"
                      className="form-input"
                      value={formData.due_date}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={isSubmitting || !formData.name.trim()}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetailsPage;
