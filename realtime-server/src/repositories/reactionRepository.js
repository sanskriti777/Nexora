import Reaction from '../models/Reaction.js';

export const reactionRepository = {
  /**
   * Add a reaction to a message by user
   * Handles duplicate identical reactions idempotently.
   *
   * @param {string|import('mongoose').Types.ObjectId} messageId
   * @param {number} userId
   * @param {string} emoji
   * @returns {Promise<import('../models/Reaction').Reaction>}
   */
  async add(messageId, userId, emoji) {
    const trimmedEmoji = String(emoji).trim();
    // Use upsert or findOneAndUpdate to prevent duplicate errors gracefully
    return await Reaction.findOneAndUpdate(
      { messageId, userId, emoji: trimmedEmoji },
      { $setOnInsert: { messageId, userId, emoji: trimmedEmoji, createdAt: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );
  },

  /**
   * Remove a reaction from a message
   *
   * @param {string|import('mongoose').Types.ObjectId} messageId
   * @param {number} userId
   * @param {string} emoji
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async remove(messageId, userId, emoji) {
    const trimmedEmoji = String(emoji).trim();
    const result = await Reaction.deleteOne({
      messageId,
      userId,
      emoji: trimmedEmoji,
    });
    return result.deletedCount > 0;
  },

  /**
   * Find all reactions for a specific message
   *
   * @param {string|import('mongoose').Types.ObjectId} messageId
   * @returns {Promise<Array<import('../models/Reaction').Reaction>>}
   */
  async findByMessageId(messageId) {
    return await Reaction.find({ messageId }).sort({ createdAt: 1 });
  },
};

export default reactionRepository;
