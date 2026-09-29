import apiClient from './api';

/**
 * Workspace API Service
 *
 * Provides real, authenticated, workspace-scoped HTTP methods
 * for workspaces and workspace membership.
 */
export const workspaceService = {
  /**
   * Get all workspaces accessible by the current authenticated user
   */
  async getWorkspaces() {
    const response = await apiClient.get('/workspaces');
    return response.data;
  },

  /**
   * Get details for a specific workspace
   *
   * @param {number|string} workspaceId
   */
  async getWorkspace(workspaceId) {
    const response = await apiClient.get(`/workspaces/${workspaceId}`);
    return response.data;
  },

  /**
   * Get paginated workspace members with optional search, role filter, and sorting
   *
   * @param {number|string} workspaceId
   * @param {Object} params - { search, role, page, per_page, sort_by, sort_order }
   */
  async getWorkspaceMembers(workspaceId, params = {}) {
    const response = await apiClient.get(`/workspaces/${workspaceId}/members`, { params });
    return response.data;
  },

  /**
   * Add a new member to the workspace by user_id or email
   *
   * @param {number|string} workspaceId
   * @param {Object} payload - { user_id, email, role, role_id }
   */
  async addWorkspaceMember(workspaceId, payload) {
    const response = await apiClient.post(`/workspaces/${workspaceId}/members`, payload);
    return response.data;
  },

  /**
   * Update a member's role within the workspace
   *
   * @param {number|string} workspaceId
   * @param {number|string} userId
   * @param {Object} payload - { role, role_id }
   */
  async updateWorkspaceMemberRole(workspaceId, userId, payload) {
    const response = await apiClient.patch(`/workspaces/${workspaceId}/members/${userId}`, payload);
    return response.data;
  },

  /**
   * Remove a member from the workspace
   *
   * @param {number|string} workspaceId
   * @param {number|string} userId
   */
  async removeWorkspaceMember(workspaceId, userId) {
    const response = await apiClient.delete(`/workspaces/${workspaceId}/members/${userId}`);
    return response.data;
  },

  /**
   * Get available roles
   */
  async getRoles() {
    const response = await apiClient.get('/roles');
    return response.data;
  },
};

export default workspaceService;
