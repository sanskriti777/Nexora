import apiClient from './api';

/**
 * Activity & Audit Logs API Service
 *
 * Provides real, authenticated HTTP methods for the NEXORA Activity & Audit module.
 */
export const activityService = {
  /**
   * Fetch paginated list of activity / audit logs with optional filters
   *
   * @param {Object} [params] - { page, per_page, workspace_id, user_id, action, entity_type, entity_id, from, to, search }
   */
  async getActivities(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/activity', config);
    return response.data;
  },

  /**
   * Fetch distinct filter options (actions, entity types, actors) for workspace context
   *
   * @param {Object} [params] - { workspace_id }
   */
  async getActivityFilters(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/activity/filters', config);
    return response.data;
  },

  /**
   * Fetch a single activity record by ID
   *
   * @param {string|number} id
   */
  async getActivity(id) {
    const response = await apiClient.get(`/activity/${id}`);
    return response.data;
  },
};

export default activityService;
