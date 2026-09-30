import Conversation from '../models/Conversation.js';

export const conversationRepository = {
  /**
   * Create a new conversation document
   *
   * @param {object} data
   * @returns {Promise<import('../models/Conversation').Conversation>}
   */
  async create(data) {
    const conversation = new Conversation(data);
    return await conversation.save();
  },

  /**
   * Find an existing direct (1-on-1) conversation between two users in a workspace
   *
   * @param {number} workspaceId
   * @param {number} userId1
   * @param {number} userId2
   * @returns {Promise<import('../models/Conversation').Conversation|null>}
   */
  async findDirectConversation(workspaceId, userId1, userId2) {
    return await Conversation.findOne({
      workspaceId,
      type: 'direct',
      participantIds: { $all: [userId1, userId2], $size: 2 },
    });
  },

  /**
   * Find a conversation by its MongoDB ID
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('../models/Conversation').Conversation|null>}
   */
  async findById(id) {
    return await Conversation.findById(id);
  },

  /**
   * Find conversations for a specific user in a workspace
   *
   * @param {number} workspaceId
   * @param {number} userId
   * @returns {Promise<Array<import('../models/Conversation').Conversation>>}
   */
  async findByUserAndWorkspace(workspaceId, userId) {
    return await Conversation.find({
      workspaceId,
      participantIds: userId,
    }).sort({ updatedAt: -1 });
  },
};

export default conversationRepository;
