import axios from 'axios';
import authService, { AUTH_TOKEN_KEY } from './authService';

const REALTIME_BASE_URL = (import.meta.env.VITE_REALTIME_URL || 'http://127.0.0.1:8002').replace(/\/+$/, '');

const chatApiClient = axios.create({
  baseURL: `${REALTIME_BASE_URL}/api/chat`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Interceptor: Attach current Sanctum Bearer token to all chat HTTP requests
chatApiClient.interceptors.request.use((config) => {
  const token = authService.getToken() || localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token.trim()}`;
  }
  return config;
});

export const chatService = {
  /**
   * Get all conversations accessible to the current user in workspace
   *
   * @param {number} workspaceId
   */
  async getConversations(workspaceId) {
    const res = await chatApiClient.get('/conversations', {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Create or fetch direct/group conversation
   *
   * @param {number} workspaceId
   * @param {{ type?: 'direct'|'group', participantIds: number[] }} payload
   */
  async createConversation(workspaceId, payload) {
    const res = await chatApiClient.post('/conversations', payload, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Get messages for a specific conversation with cursor pagination
   *
   * @param {number} workspaceId
   * @param {string} conversationId
   * @param {{ beforeCursor?: object, limit?: number }} [params]
   */
  async getConversationMessages(workspaceId, conversationId, params = {}) {
    const query = { limit: params.limit || 30 };
    if (params.beforeCursor) {
      query.beforeCursor = JSON.stringify(params.beforeCursor);
    }
    const res = await chatApiClient.get(`/conversations/${conversationId}/messages`, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
      params: query,
    });
    return res.data;
  },

  /**
   * Get all accessible channels in workspace
   *
   * @param {number} workspaceId
   * @param {{ team_id?: number }} [params]
   */
  async getChannels(workspaceId, params = {}) {
    const res = await chatApiClient.get('/channels', {
      headers: { 'X-Workspace-Id': String(workspaceId) },
      params,
    });
    return res.data;
  },

  /**
   * Create a new channel
   *
   * @param {number} workspaceId
   * @param {{ name: string, description?: string, isPrivate?: boolean, teamId?: number, memberIds?: number[] }} payload
   */
  async createChannel(workspaceId, payload) {
    const res = await chatApiClient.post('/channels', payload, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Get messages for a specific channel with cursor pagination
   *
   * @param {number} workspaceId
   * @param {string} channelId
   * @param {{ beforeCursor?: object, limit?: number }} [params]
   */
  async getChannelMessages(workspaceId, channelId, params = {}) {
    const query = { limit: params.limit || 30 };
    if (params.beforeCursor) {
      query.beforeCursor = JSON.stringify(params.beforeCursor);
    }
    const res = await chatApiClient.get(`/channels/${channelId}/messages`, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
      params: query,
    });
    return res.data;
  },

  /**
   * Send a message to a conversation or channel
   *
   * @param {number} workspaceId
   * @param {{ conversationId?: string, channelId?: string, content: string, replyToMessageId?: string, threadId?: string }} payload
   */
  async sendMessage(workspaceId, payload) {
    const res = await chatApiClient.post('/messages', payload, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Edit an existing message
   *
   * @param {number} workspaceId
   * @param {string} messageId
   * @param {string} content
   */
  async editMessage(workspaceId, messageId, content) {
    const res = await chatApiClient.patch(
      `/messages/${messageId}`,
      { content },
      { headers: { 'X-Workspace-Id': String(workspaceId) } }
    );
    return res.data;
  },

  /**
   * Soft-delete an existing message
   *
   * @param {number} workspaceId
   * @param {string} messageId
   */
  async deleteMessage(workspaceId, messageId) {
    const res = await chatApiClient.delete(`/messages/${messageId}`, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Add reaction to a message
   *
   * @param {number} workspaceId
   * @param {string} messageId
   * @param {string} emoji
   */
  async addReaction(workspaceId, messageId, emoji) {
    const res = await chatApiClient.post(
      `/messages/${messageId}/reactions`,
      { emoji },
      { headers: { 'X-Workspace-Id': String(workspaceId) } }
    );
    return res.data;
  },

  /**
   * Remove reaction from a message
   *
   * @param {number} workspaceId
   * @param {string} messageId
   * @param {string} emoji
   */
  async removeReaction(workspaceId, messageId, emoji) {
    const res = await chatApiClient.delete(`/messages/${messageId}/reactions`, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
      params: { emoji },
    });
    return res.data;
  },

  /**
   * Get thread messages for a root message
   *
   * @param {number} workspaceId
   * @param {string} rootMessageId
   */
  async getThread(workspaceId, rootMessageId) {
    const res = await chatApiClient.get(`/threads/${rootMessageId}`, {
      headers: { 'X-Workspace-Id': String(workspaceId) },
    });
    return res.data;
  },

  /**
   * Post a reply to a thread
   *
   * @param {number} workspaceId
   * @param {string} rootMessageId
   * @param {string} content
   */
  async createThreadReply(workspaceId, rootMessageId, content) {
    const res = await chatApiClient.post(
      `/threads/${rootMessageId}/replies`,
      { content },
      { headers: { 'X-Workspace-Id': String(workspaceId) } }
    );
    return res.data;
  },
};

export default chatService;
