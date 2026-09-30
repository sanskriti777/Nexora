import Thread from '../models/Thread.js';

export const threadRepository = {
  /**
   * Create a new reply thread for a root message
   *
   * @param {object} data
   * @returns {Promise<import('../models/Thread').Thread>}
   */
  async create(data) {
    const thread = new Thread(data);
    return await thread.save();
  },

  /**
   * Find an existing thread by root message ID
   *
   * @param {string|import('mongoose').Types.ObjectId} rootMessageId
   * @returns {Promise<import('../models/Thread').Thread|null>}
   */
  async findByRootMessageId(rootMessageId) {
    return await Thread.findOne({ rootMessageId });
  },

  /**
   * Find a thread by its MongoDB ID
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('../models/Thread').Thread|null>}
   */
  async findById(id) {
    return await Thread.findById(id);
  },
};

export default threadRepository;
