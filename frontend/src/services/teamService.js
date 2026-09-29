import apiClient from './api';

/**
 * Team API Service
 *
 * Provides real, authenticated, workspace-scoped HTTP methods
 * for Teams and Team Membership.
 */
export const teamService = {
  /**
   * Fetch all teams in the workspace
   *
   * @param {Object} params - { workspace_id, search }
   */
  async getTeams(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/teams', config);
    return response.data;
  },

  /**
   * Fetch a single team by ID with lead, members, and projects
   *
   * @param {number|string} teamId
   */
  async getTeam(teamId) {
    const response = await apiClient.get(`/teams/${teamId}`);
    return response.data;
  },

  /**
   * Create a new team
   *
   * @param {Object} payload - { name, description, team_lead_id, workspace_id }
   */
  async createTeam(payload) {
    const config = {};
    if (payload.workspace_id) {
      config.headers = { 'X-Workspace-Id': payload.workspace_id };
    }
    const response = await apiClient.post('/teams', payload, config);
    return response.data;
  },

  /**
   * Update an existing team
   *
   * @param {number|string} teamId
   * @param {Object} payload - { name, description, team_lead_id }
   */
  async updateTeam(teamId, payload) {
    const response = await apiClient.patch(`/teams/${teamId}`, payload);
    return response.data;
  },

  /**
   * Delete a team
   *
   * @param {number|string} teamId
   */
  async deleteTeam(teamId) {
    const response = await apiClient.delete(`/teams/${teamId}`);
    return response.data;
  },

  /**
   * Get members of a team
   *
   * @param {number|string} teamId
   */
  async getTeamMembers(teamId) {
    const response = await apiClient.get(`/teams/${teamId}/members`);
    return response.data;
  },

  /**
   * Add a member to a team
   *
   * @param {number|string} teamId
   * @param {Object} payload - { user_id, role }
   */
  async addTeamMember(teamId, payload) {
    const response = await apiClient.post(`/teams/${teamId}/members`, payload);
    return response.data;
  },

  /**
   * Remove a member from a team
   *
   * @param {number|string} teamId
   * @param {number|string} userId
   */
  async removeTeamMember(teamId, userId) {
    const response = await apiClient.delete(`/teams/${teamId}/members/${userId}`);
    return response.data;
  },
};

export default teamService;
