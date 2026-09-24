import apiClient from './api';

/**
 * Projects API Service
 *
 * Provides real, authenticated, workspace-scoped HTTP methods
 * for the NEXORA Projects module.
 */
export const projectService = {
  /**
   * Fetch paginated list of projects with optional search, filter, and sorting
   *
   * @param {Object} params - { search, status, priority, member_id, sort_by, sort_order, page, per_page, workspace_id }
   */
  async getProjects(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/projects', config);
    return response.data;
  },

  /**
   * Fetch single project details including metrics, tasks summary, members, and activity
   *
   * @param {number|string} projectId
   */
  async getProject(projectId) {
    const response = await apiClient.get(`/projects/${projectId}`);
    return response.data;
  },

  /**
   * Create a new project
   *
   * @param {Object} payload - { name, description, status, priority, start_date, due_date, team_id, manager_id, workspace_id }
   */
  async createProject(payload) {
    const config = {};
    if (payload.workspace_id) {
      config.headers = { 'X-Workspace-Id': payload.workspace_id };
    }
    const response = await apiClient.post('/projects', payload, config);
    return response.data;
  },

  /**
   * Update project details
   *
   * @param {number|string} projectId
   * @param {Object} payload
   */
  async updateProject(projectId, payload) {
    const response = await apiClient.put(`/projects/${projectId}`, payload);
    return response.data;
  },

  /**
   * Soft-delete / archive project
   *
   * @param {number|string} projectId
   */
  async deleteProject(projectId) {
    const response = await apiClient.delete(`/projects/${projectId}`);
    return response.data;
  },

  /**
   * Add a user to project members
   *
   * @param {number|string} projectId
   * @param {Object} payload - { user_id, role }
   */
  async addProjectMember(projectId, payload) {
    const response = await apiClient.post(`/projects/${projectId}/members`, payload);
    return response.data;
  },

  /**
   * Remove a user from project members
   *
   * @param {number|string} projectId
   * @param {number|string} userId
   */
  async removeProjectMember(projectId, userId) {
    const response = await apiClient.delete(`/projects/${projectId}/members/${userId}`);
    return response.data;
  },
};

export default projectService;
