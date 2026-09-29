import apiClient from './api';

/**
 * Tasks API Service
 *
 * Provides real, authenticated, workspace-scoped HTTP methods
 * for the NEXORA Tasks module.
 */
export const taskService = {
  /**
   * Fetch paginated list of tasks with optional search, filter, and sorting
   *
   * @param {Object} params - { search, status, priority, project_id, assignee_id, sort_by, sort_direction, page, per_page, workspace_id }
   */
  async getTasks(params = {}) {
    const config = { params };
    if (params.workspace_id) {
      config.headers = { 'X-Workspace-Id': params.workspace_id };
    }
    const response = await apiClient.get('/tasks', config);
    return response.data;
  },

  /**
   * Fetch single task details including project, assignees, and creator
   *
   * @param {number|string} taskId
   */
  async getTask(taskId) {
    const response = await apiClient.get(`/tasks/${taskId}`);
    return response.data;
  },

  /**
   * Create a new task
   *
   * @param {Object} payload - { title, description, project_id, team_id, status, priority, due_date, assignees }
   */
  async createTask(payload) {
    const response = await apiClient.post('/tasks', payload);
    return response.data;
  },

  /**
   * Update task details or status
   *
   * @param {number|string} taskId
   * @param {Object} payload
   */
  async updateTask(taskId, payload) {
    const response = await apiClient.put(`/tasks/${taskId}`, payload);
    return response.data;
  },

  /**
   * Soft-delete a task
   *
   * @param {number|string} taskId
   */
  async deleteTask(taskId) {
    const response = await apiClient.delete(`/tasks/${taskId}`);
    return response.data;
  },

  /**
   * Fetch tasks for a specific project
   *
   * @param {number|string} projectId
   * @param {Object} params
   */
  async getProjectTasks(projectId, params = {}) {
    const config = { params };
    const response = await apiClient.get(`/projects/${projectId}/tasks`, config);
    return response.data;
  },
};

export default taskService;
