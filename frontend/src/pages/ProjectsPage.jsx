import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import projectService from '../services/projectService';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
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
  { value: 'name:asc', label: 'Name (A to Z)' },
  { value: 'name:desc', label: 'Name (Z to A)' },
  { value: 'due_date:asc', label: 'Due Date (Earliest)' },
  { value: 'due_date:desc', label: 'Due Date (Latest)' },
];

export const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 10 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortSelection, setSortSelection] = useState('created_at:desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProjectId, setDeletingProjectId] = useState(null);

  // Form State
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
    const [sortBy, sortOrder] = sortSelection.split(':');

    projectService
      .getProjects({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page: currentPage,
        per_page: 10,
      })
      .then((res) => {
        if (!ignore) {
          if (res.success) {
            setProjects(res.data || []);
            if (res.meta) {
              setMeta(res.meta);
            }
          } else {
            setErrorMessage(res.message || 'Failed to fetch projects.');
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
  }, [search, statusFilter, priorityFilter, sortSelection, currentPage, refreshIndex]);

  const refreshProjects = () => {
    setIsLoading(true);
    setRefreshIndex((prev) => prev + 1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handlePriorityChange = (e) => {
    setPriorityFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    setSortSelection(e.target.value);
    setCurrentPage(1);
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      status: 'planning',
      priority: 'medium',
      start_date: '',
      due_date: '',
    });
    setFormErrors({});
    setActionError(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (project) => {
    setEditingProject(project);
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
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors({});
    setActionError(null);

    try {
      const res = await projectService.createProject(formData);
      if (res.success) {
        setIsCreateModalOpen(false);
        refreshProjects();
      }
    } catch (err) {
      if (err.errors) {
        setFormErrors(err.errors);
      } else {
        setActionError(err.message || 'Failed to create project.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingProject) return;

    setIsSubmitting(true);
    setFormErrors({});
    setActionError(null);

    try {
      const res = await projectService.updateProject(editingProject.id, formData);
      if (res.success) {
        setEditingProject(null);
        refreshProjects();
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

  const handleDelete = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project? It will be archived and removed from active workflows.')) {
      return;
    }

    try {
      setDeletingProjectId(projectId);
      const res = await projectService.deleteProject(projectId);
      if (res.success) {
        refreshProjects();
      }
    } catch (err) {
      alert(err.message || 'Failed to delete project.');
    } finally {
      setDeletingProjectId(null);
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

  return (
    <div className="projects-container">
      {/* Page Header */}
      <header className="page-header projects-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Manage, track, and organize workspace projects.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={openCreateModal} id="new-project-btn">
            + New Project
          </Button>
        </div>
      </header>

      {/* Control Bar: Search & Filter Toolbar */}
      <div className="projects-toolbar card">
        <div className="toolbar-search">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            className="input-search"
            placeholder="Search projects by name or description..."
            value={search}
            onChange={handleSearchChange}
            aria-label="Search projects"
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => { setSearch(''); setCurrentPage(1); }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="toolbar-filters">
          <div className="filter-group">
            <label htmlFor="filter-status" className="filter-label">Status</label>
            <select
              id="filter-status"
              className="select-filter"
              value={statusFilter}
              onChange={handleStatusChange}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-priority" className="filter-label">Priority</label>
            <select
              id="filter-priority"
              className="select-filter"
              value={priorityFilter}
              onChange={handlePriorityChange}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-sort" className="filter-label">Sort</label>
            <select
              id="filter-sort"
              className="select-filter"
              value={sortSelection}
              onChange={handleSortChange}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="projects-loading-skeleton card">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : errorMessage ? (
        <Card className="dashboard-error-card">
          <div className="error-icon" aria-hidden="true">⚠️</div>
          <h2 className="error-title">Unable to Load Projects</h2>
          <p className="error-description">{errorMessage}</p>
          <Button variant="primary" onClick={refreshProjects}>
            Retry
          </Button>
        </Card>
      ) : projects.length === 0 ? (
        <div className="empty-state-card card">
          <div className="empty-icon" aria-hidden="true">📁</div>
          <h2 className="empty-title">No projects yet</h2>
          <p className="empty-description">
            {search || statusFilter || priorityFilter
              ? 'No projects match your current filters. Try resetting your search terms.'
              : 'Create your first project to start managing your work.'}
          </p>
          <div className="empty-actions">
            {search || statusFilter || priorityFilter ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setPriorityFilter('');
                  setCurrentPage(1);
                }}
              >
                Reset Filters
              </Button>
            ) : (
              <Button variant="primary" onClick={openCreateModal}>
                + New Project
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="projects-table-card card">
          <div className="table-responsive">
            <table className="projects-table" aria-label="Projects list">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Tasks</th>
                  <th scope="col">Members</th>
                  <th scope="col">Due Date</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((proj) => (
                  <tr key={proj.id} className="project-row">
                    <td className="project-name-cell">
                      <Link to={`/projects/${proj.id}`} className="project-title-link">
                        {proj.name}
                      </Link>
                      {proj.description && (
                        <p className="project-desc-snippet">{proj.description}</p>
                      )}
                    </td>
                    <td>{getStatusBadge(proj.status)}</td>
                    <td>{getPriorityBadge(proj.priority)}</td>
                    <td className="project-progress-cell">
                      {proj.progress !== null ? (
                        <div className="progress-container">
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(0, proj.progress))}%` }}
                            />
                          </div>
                          <span className="progress-text">{proj.progress}%</span>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">No tasks</span>
                      )}
                    </td>
                    <td>
                      <span className="task-counts-badge">
                        {proj.completed_tasks_count} / {proj.total_tasks_count}
                      </span>
                    </td>
                    <td>
                      <span className="members-count-badge">
                        👥 {proj.members_count}
                      </span>
                    </td>
                    <td>
                      <span className="due-date-text">
                        {proj.due_date ? proj.due_date : 'No deadline'}
                      </span>
                    </td>
                    <td className="text-right actions-cell">
                      <Link to={`/projects/${proj.id}`} className="btn-table-action" title="View details">
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => openEditModal(proj)}
                        title="Edit project"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-table-action danger"
                        onClick={() => handleDelete(proj.id)}
                        disabled={deletingProjectId === proj.id}
                        title="Delete project"
                      >
                        {deletingProjectId === proj.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Server-side Pagination */}
          <div className="projects-pagination">
            <span className="pagination-info">
              Showing {projects.length} of {meta.total} projects (Page {meta.current_page} of {meta.last_page})
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

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="create-project-title" className="modal-title">Create New Project</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                {actionError && (
                  <div className="form-error-banner" role="alert">
                    {actionError}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="create-name" className="form-label">
                    Project Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    name="name"
                    required
                    className={`form-input ${formErrors.name ? 'input-error' : ''}`}
                    placeholder="e.g. Core Infrastructure Migration"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                  {formErrors.name && (
                    <span className="form-error-msg">{formErrors.name[0]}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="create-desc" className="form-label">Description</label>
                  <textarea
                    id="create-desc"
                    name="description"
                    rows="3"
                    className={`form-textarea ${formErrors.description ? 'input-error' : ''}`}
                    placeholder="Briefly describe the project goals and scope..."
                    value={formData.description}
                    onChange={handleFormChange}
                  />
                  {formErrors.description && (
                    <span className="form-error-msg">{formErrors.description[0]}</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="create-status" className="form-label">Status</label>
                    <select
                      id="create-status"
                      name="status"
                      className="form-select"
                      value={formData.status}
                      onChange={handleFormChange}
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="create-priority" className="form-label">Priority</label>
                    <select
                      id="create-priority"
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
                    <label htmlFor="create-start-date" className="form-label">Start Date</label>
                    <input
                      id="create-start-date"
                      type="date"
                      name="start_date"
                      className="form-input"
                      value={formData.start_date}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="create-due-date" className="form-label">Due Date</label>
                    <input
                      id="create-due-date"
                      type="date"
                      name="due_date"
                      className={`form-input ${formErrors.due_date ? 'input-error' : ''}`}
                      value={formData.due_date}
                      onChange={handleFormChange}
                    />
                    {formErrors.due_date && (
                      <span className="form-error-msg">{formErrors.due_date[0]}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
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
                  Create Project
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="edit-project-title" className="modal-title">Edit Project</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingProject(null)}
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
                  <label htmlFor="edit-name" className="form-label">
                    Project Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="edit-name"
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
                  <label htmlFor="edit-desc" className="form-label">Description</label>
                  <textarea
                    id="edit-desc"
                    name="description"
                    rows="3"
                    className={`form-textarea ${formErrors.description ? 'input-error' : ''}`}
                    value={formData.description}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="edit-status" className="form-label">Status</label>
                    <select
                      id="edit-status"
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
                    <label htmlFor="edit-priority" className="form-label">Priority</label>
                    <select
                      id="edit-priority"
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
                    <label htmlFor="edit-start-date" className="form-label">Start Date</label>
                    <input
                      id="edit-start-date"
                      type="date"
                      name="start_date"
                      className="form-input"
                      value={formData.start_date}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-due-date" className="form-label">Due Date</label>
                    <input
                      id="edit-due-date"
                      type="date"
                      name="due_date"
                      className={`form-input ${formErrors.due_date ? 'input-error' : ''}`}
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
                  onClick={() => setEditingProject(null)}
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

export default ProjectsPage;
