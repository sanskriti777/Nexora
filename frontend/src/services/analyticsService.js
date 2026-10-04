import apiClient from './api';

/**
 * Analytics API Service
 *
 * Centralized service for the NEXORA Analytics module.
 * Consumes real Laravel Analytics APIs:
 * - GET /api/analytics/overview
 * - GET /api/analytics/tasks
 * - GET /api/analytics/projects
 * - GET /api/analytics/workload
 *
 * Supports workspace context via params and X-Workspace-Id header,
 * as well as date range filtering (start_date, end_date).
 */
export const analyticsService = {
  /**
   * Fetch comprehensive workspace analytics overview
   *
   * @param {Object} [params] - { workspace_id, start_date, end_date }
   * @returns {Promise<Object>} API response object with success and data
   */
  async getOverview(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/analytics/overview', config);
    return response.data;
  },

  /**
   * Fetch focused task metrics and distributions
   *
   * @param {Object} [params] - { workspace_id, start_date, end_date }
   * @returns {Promise<Object>} API response object with success and data
   */
  async getTasks(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/analytics/tasks', config);
    return response.data;
  },

  /**
   * Fetch focused project performance and throughput metrics
   *
   * @param {Object} [params] - { workspace_id, start_date, end_date }
   * @returns {Promise<Object>} API response object with success and data
   */
  async getProjects(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/analytics/projects', config);
    return response.data;
  },

  /**
   * Fetch focused team member workload metrics
   *
   * @param {Object} [params] - { workspace_id, start_date, end_date }
   * @returns {Promise<Object>} API response object with success and data
   */
  async getWorkload(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/analytics/workload', config);
    return response.data;
  },
};

export default analyticsService;
