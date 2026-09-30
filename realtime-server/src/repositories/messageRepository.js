import Message from '../models/Message.js';

export const messageRepository = {
  /**
   * Create and persist a message
   *
   * @param {object} data
   * @returns {Promise<import('../models/Message').Message>}
   */
  async create(data) {
    const message = new Message(data);
    return await message.save();
  },

  /**
   * Find a message by its MongoDB ID
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('../models/Message').Message|null>}
   */
  async findById(id) {
    return await Message.findById(id);
  },

  /**
   * Edit message content and set editedAt timestamp
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @param {string} newContent
   * @returns {Promise<import('../models/Message').Message|null>}
   */
  async updateContent(id, newContent) {
    return await Message.findByIdAndUpdate(
      id,
      {
        content: newContent,
        editedAt: new Date(),
      },
      { new: true, runValidators: true }
    );
  },

  /**
   * Soft-delete a message by setting deletedAt timestamp
   * Historical content is preserved in storage.
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('../models/Message').Message|null>}
   */
  async softDelete(id) {
    return await Message.findByIdAndUpdate(
      id,
      {
        deletedAt: new Date(),
      },
      { new: true }
    );
  },

  /**
   * Fetch messages using stable cursor-based pagination (createdAt + _id)
   *
   * @param {object} params
   * @param {number} [params.workspaceId]
   * @param {string} [params.conversationId]
   * @param {string} [params.channelId]
   * @param {string} [params.threadId]
   * @param {{ createdAt: Date|string, _id: string }} [params.beforeCursor] Cursor for older messages
   * @param {number} [params.limit=20] Number of messages per page (max 100)
   * @returns {Promise<{ messages: Array<object>, pagination: { limit: number, hasMore: boolean, nextCursor: object|null } }>}
   */
  async findPaginated({ workspaceId, conversationId, channelId, threadId, beforeCursor, limit = 20 }) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const query = {};

    if (workspaceId) query.workspaceId = workspaceId;
    if (conversationId) query.conversationId = conversationId;
    if (channelId) query.channelId = channelId;
    if (threadId) query.threadId = threadId;

    if (beforeCursor && beforeCursor.createdAt && beforeCursor._id) {
      const cursorDate = new Date(beforeCursor.createdAt);
      query.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: beforeCursor._id } },
      ];
    }

    // Query safeLimit + 1 to check if another page exists without countDocuments() overhead
    const docs = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    const hasMore = docs.length > safeLimit;
    const messages = hasMore ? docs.slice(0, safeLimit) : docs;

    const nextCursor =
      hasMore && messages.length > 0
        ? {
            createdAt: messages[messages.length - 1].createdAt,
            _id: messages[messages.length - 1]._id.toString(),
          }
        : null;

    return {
      messages,
      pagination: {
        limit: safeLimit,
        hasMore,
        nextCursor,
      },
    };
  },
};

export default messageRepository;
