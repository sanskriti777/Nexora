import Channel from '../models/Channel.js';

export const channelRepository = {
  /**
   * Create a new channel
   *
   * @param {object} data
   * @returns {Promise<import('../models/Channel').Channel>}
   */
  async create(data) {
    const channel = new Channel(data);
    return await channel.save();
  },

  /**
   * Find a channel by workspace, team, and name
   *
   * @param {number} workspaceId
   * @param {string} name
   * @param {number|null} [teamId=null]
   * @returns {Promise<import('../models/Channel').Channel|null>}
   */
  async findByName(workspaceId, name, teamId = null) {
    const normalizedName = String(name).trim().toLowerCase();
    return await Channel.findOne({
      workspaceId,
      teamId: teamId ?? null,
      name: normalizedName,
    });
  },

  /**
   * Find a channel by its MongoDB ID
   *
   * @param {string|import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('../models/Channel').Channel|null>}
   */
  async findById(id) {
    return await Channel.findById(id);
  },

  /**
   * Find accessible channels in a workspace
   *
   * @param {number} workspaceId
   * @param {number} [teamId]
   * @returns {Promise<Array<import('../models/Channel').Channel>>}
   */
  async findByWorkspace(workspaceId, teamId = null) {
    const query = { workspaceId };
    if (teamId !== undefined && teamId !== null) {
      query.teamId = teamId;
    }
    return await Channel.find(query).sort({ name: 1 });
  },
};

export default channelRepository;
