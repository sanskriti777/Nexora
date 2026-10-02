import apiClient from './api';

/**
 * Notifications API Service
 *
 * Provides real, authenticated HTTP methods for the NEXORA Notifications module.
 */
export const notificationService = {
  /**
   * Fetch paginated list of notifications with optional filtering
   *
   * @param {Object} [params] - { page, per_page, unread_only, filter, type, workspace_id }
   */
  async getNotifications(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/notifications', config);
    return response.data;
  },

  /**
   * Fetch unread notification count
   *
   * @param {Object} [params] - { workspace_id }
   */
  async getUnreadCount(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/notifications/unread-count', config);
    return response.data;
  },

  /**
   * Mark a single notification as read
   *
   * @param {string} notificationId
   */
  async markAsRead(notificationId) {
    const response = await apiClient.patch(`/notifications/${notificationId}/read`);
    return response.data;
  },

  /**
   * Mark all notifications as read
   *
   * @param {Object} [params] - { workspace_id }
   */
  async markAllAsRead(params = {}) {
    const config = {};
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.post('/notifications/read-all', {}, config);
    return response.data;
  },

  /**
   * Delete a notification
   *
   * @param {string} notificationId
   */
  async deleteNotification(notificationId) {
    const response = await apiClient.delete(`/notifications/${notificationId}`);
    return response.data;
  },
};

export default notificationService;
