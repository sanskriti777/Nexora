import apiClient from './api';

/**
 * Calendar API Service
 *
 * Provides real, authenticated, workspace-scoped HTTP methods
 * for task deadline visualization on the NEXORA Calendar.
 */
export const calendarService = {
  /**
   * Fetch calendar tasks within a date range and optional filters.
   *
   * @param {Object} params - { start, end, workspace_id, project_id, team_id, assignee_id, status, priority, overdue }
   */
  async getCalendar(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/calendar', config);
    return response.data;
  },
};

export default calendarService;
