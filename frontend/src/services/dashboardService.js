import apiClient from './api';

/**
 * Dashboard Service
 *
 * Fetches aggregated workspace metrics and activity for the authenticated user.
 */
export const dashboardService = {
  /**
   * Retrieve dashboard data for current or specified workspace
   *
   * @param {number|string|null} workspaceId
   * @returns {Promise<Object>}
   */
  getDashboardData: async (workspaceId = null) => {
    const config = {};
    if (workspaceId) {
      config.headers = { 'X-Workspace-Id': workspaceId };
    }

    const response = await apiClient.get('/dashboard', config);
    return response.data?.data || null;
  },
};

export default dashboardService;
