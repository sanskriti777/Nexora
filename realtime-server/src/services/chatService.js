import conversationRepository from '../repositories/conversationRepository.js';
import channelRepository from '../repositories/channelRepository.js';
import messageRepository from '../repositories/messageRepository.js';
import threadRepository from '../repositories/threadRepository.js';
import reactionRepository from '../repositories/reactionRepository.js';

/**
 * Chat Service
 *
 * Coordinates business rules, validation, and persistence across chat domain models.
 * Enforces authoritative separation of authenticated user identity from untrusted payload data.
 */
export const chatService = {
  /**
   * Create a conversation or return existing direct conversation if one already exists
   *
   * @param {object} payload
   * @param {number} payload.workspaceId
   * @param {'direct'|'group'} [payload.type='direct']
   * @param {number[]} payload.participantIds
   * @param {number} authenticatedUserId Authoritative MySQL user ID from verified handshake
   * @returns {Promise<object>}
   */
  async createConversation(payload, authenticatedUserId) {
    const { workspaceId, type = 'direct', participantIds = [] } = payload;

    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }

    // Ensure the authenticated creator is included in participants
    const uniqueParticipants = Array.from(new Set([...participantIds, authenticatedUserId]));

    if (uniqueParticipants.length < 2) {
      throw new Error('A conversation requires at least 2 participants');
    }

    if (type === 'direct') {
      if (uniqueParticipants.length !== 2) {
        throw new Error('A direct conversation must have exactly 2 participants');
      }

      // Check if direct conversation already exists between these 2 users in this workspace
      const existing = await conversationRepository.findDirectConversation(
        workspaceId,
        uniqueParticipants[0],
        uniqueParticipants[1]
      );

      if (existing) {
        return existing;
      }
    }

    return await conversationRepository.create({
      workspaceId,
      type,
      participantIds: uniqueParticipants,
      createdBy: authenticatedUserId,
    });
  },

  /**
   * Find a direct conversation between two users
   *
   * @param {number} workspaceId
   * @param {number} user1
   * @param {number} user2
   */
  async getDirectConversation(workspaceId, user1, user2) {
    return await conversationRepository.findDirectConversation(workspaceId, user1, user2);
  },

  /**
   * Create a new workspace channel
   *
   * @param {object} payload
   * @param {number} payload.workspaceId
   * @param {number|null} [payload.teamId]
   * @param {string} payload.name
   * @param {string} [payload.description]
   * @param {boolean} [payload.isPrivate=false]
   * @param {number[]} [payload.memberIds=[]]
   * @param {number} authenticatedUserId Authoritative MySQL user ID
   * @returns {Promise<object>}
   */
  async createChannel(payload, authenticatedUserId) {
    const {
      workspaceId,
      teamId = null,
      name,
      description = '',
      isPrivate = false,
      memberIds = [],
    } = payload;

    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('Channel name is required');
    }

    const normalizedName = name.trim().toLowerCase();

    // Check for existing channel with identical name in same workspace & team scope
    const existing = await channelRepository.findByName(workspaceId, normalizedName, teamId);
    if (existing) {
      throw new Error(`A channel named "${normalizedName}" already exists in this workspace scope`);
    }

    const uniqueMembers = Array.from(new Set([...memberIds, authenticatedUserId]));

    return await channelRepository.create({
      workspaceId,
      teamId: teamId ?? null,
      name: normalizedName,
      description,
      isPrivate,
      memberIds: uniqueMembers,
      createdBy: authenticatedUserId,
    });
  },

  /**
   * Create a message in a conversation or channel
   *
   * @param {object} payload
   * @param {number} payload.workspaceId
   * @param {string} [payload.conversationId]
   * @param {string} [payload.channelId]
   * @param {string} payload.content
   * @param {'text'|'system'} [payload.messageType='text']
   * @param {string} [payload.replyToMessageId]
   * @param {string} [payload.threadId]
   * @param {number} authenticatedUserId Authoritative MySQL user ID
   * @returns {Promise<object>}
   */
  async createMessage(payload, authenticatedUserId) {
    const {
      workspaceId,
      conversationId,
      channelId,
      content,
      messageType = 'text',
      replyToMessageId = null,
      threadId = null,
    } = payload;

    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new Error('Message content is required');
    }

    // Mutual exclusivity validation: exactly one destination must be specified
    const hasConv = Boolean(conversationId);
    const hasChan = Boolean(channelId);

    if (hasConv === hasChan) {
      throw new Error('Message must belong to either a conversation or a channel, but not both');
    }

    // Verify destination exists
    if (hasConv) {
      const conv = await conversationRepository.findById(conversationId);
      if (!conv) {
        throw new Error('Target conversation does not exist');
      }
    } else {
      const chan = await channelRepository.findById(channelId);
      if (!chan) {
        throw new Error('Target channel does not exist');
      }
    }

    // If replyToMessageId is supplied, verify parent message exists
    if (replyToMessageId) {
      const parentMsg = await messageRepository.findById(replyToMessageId);
      if (!parentMsg) {
        throw new Error('Target replyToMessage does not exist');
      }
    }

    // If threadId is supplied, verify thread exists
    if (threadId) {
      const thread = await threadRepository.findById(threadId);
      if (!thread) {
        throw new Error('Target thread does not exist');
      }
    }

    const message = await messageRepository.create({
      workspaceId,
      conversationId: conversationId || null,
      channelId: channelId || null,
      senderId: authenticatedUserId, // Authoritative identity
      content: content.trim(),
      messageType,
      replyToMessageId: replyToMessageId || null,
      threadId: threadId || null,
    });

    // Notify other participant for Direct Messages
    if (hasConv) {
      const conv = await conversationRepository.findById(conversationId);
      if (conv && conv.type === 'direct') {
        const otherParticipantId = conv.participantIds.find(id => id !== authenticatedUserId);
        if (otherParticipantId) {
          try {
            const laravelUrl = process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001';
            const secret = process.env.INTERNAL_SECRET || 'nexora-internal-secret';
            fetch(`${laravelUrl}/api/internal/notifications`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': secret
              },
              body: JSON.stringify({
                user_id: otherParticipantId,
                workspace_id: workspaceId,
                type: 'chat_dm',
                title: 'New Direct Message',
                message: `You received a new direct message`,
                entity_type: 'conversation',
                entity_id: conversationId,
                data: { message_id: message.id }
              })
            }).catch(e => console.error('[Notification] Failed to create DM notification:', e));
          } catch (e) {
            console.error('[Notification] Failed to create DM notification:', e);
          }
        }
      }
    }

    // Process mentions via Laravel
    if (content.includes('@')) {
      try {
        const laravelUrl = process.env.LARAVEL_API_URL || 'http://127.0.0.1:8001';
        const secret = process.env.INTERNAL_SECRET || 'nexora-internal-secret';
        fetch(`${laravelUrl}/api/internal/chat/mentions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': secret
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            content: content,
            sender_id: authenticatedUserId,
            channel_id: channelId || null,
            conversation_id: conversationId || null,
            message_id: message.id
          })
        }).catch(e => console.error('[Notification] Failed to process mentions:', e));
      } catch (e) {
        console.error('[Notification] Failed to process mentions:', e);
      }
    }

    return message;
  },

  /**
   * Fetch messages with cursor-based pagination
   *
   * @param {object} query
   * @param {number} [query.workspaceId]
   * @param {string} [query.conversationId]
   * @param {string} [query.channelId]
   * @param {string} [query.threadId]
   * @param {{ createdAt: Date|string, _id: string }} [query.beforeCursor]
   * @param {number} [query.limit=20]
   * @returns {Promise<{ messages: Array<object>, pagination: object }>}
   */
  async getMessages(query) {
    return await messageRepository.findPaginated(query);
  },

  /**
   * Edit an existing message
   * Only the original sender is permitted to edit content.
   *
   * @param {string} messageId
   * @param {string} newContent
   * @param {number} authenticatedUserId
   * @returns {Promise<object>}
   */
  async editMessage(messageId, newContent, authenticatedUserId) {
    if (!newContent || typeof newContent !== 'string' || newContent.trim() === '') {
      throw new Error('New content cannot be empty');
    }

    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.deletedAt) {
      throw new Error('Cannot edit a deleted message');
    }

    if (message.senderId !== authenticatedUserId) {
      throw new Error('Unauthorized: Only the sender can edit this message');
    }

    return await messageRepository.updateContent(messageId, newContent.trim());
  },

  /**
   * Soft-delete an existing message
   * Only the original sender (or an admin) is permitted to delete.
   *
   * @param {string} messageId
   * @param {number} authenticatedUserId
   * @param {boolean} [isAdmin=false]
   * @returns {Promise<object>}
   */
  async softDeleteMessage(messageId, authenticatedUserId, isAdmin = false) {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.deletedAt) {
      return message; // Already deleted, idempotent
    }

    if (message.senderId !== authenticatedUserId && !isAdmin) {
      throw new Error('Unauthorized: You cannot delete this message');
    }

    return await messageRepository.softDelete(messageId);
  },

  /**
   * Create a threaded conversation rooted at a parent message
   *
   * @param {string} rootMessageId
   * @param {number} authenticatedUserId
   * @returns {Promise<object>}
   */
  async createThread(rootMessageId, authenticatedUserId) {
    const rootMessage = await messageRepository.findById(rootMessageId);
    if (!rootMessage) {
      throw new Error('Root message does not exist');
    }

    // Check if thread already exists for this root message
    const existing = await threadRepository.findByRootMessageId(rootMessageId);
    if (existing) {
      return existing;
    }

    const thread = await threadRepository.create({
      workspaceId: rootMessage.workspaceId,
      rootMessageId: rootMessage._id,
      channelId: rootMessage.channelId || null,
      conversationId: rootMessage.conversationId || null,
      createdBy: authenticatedUserId,
    });

    // Optionally link root message to thread
    if (!rootMessage.threadId) {
      rootMessage.threadId = thread._id;
      await rootMessage.save();
    }

    return thread;
  },

  /**
   * Add an emoji reaction to a message
   *
   * @param {string} messageId
   * @param {string} emoji
   * @param {number} authenticatedUserId
   * @returns {Promise<object>}
   */
  async addReaction(messageId, emoji, authenticatedUserId) {
    if (!emoji || typeof emoji !== 'string' || emoji.trim() === '') {
      throw new Error('Emoji is required');
    }

    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new Error('Target message not found');
    }

    return await reactionRepository.add(messageId, authenticatedUserId, emoji.trim());
  },

  /**
   * Remove an emoji reaction from a message
   *
   * @param {string} messageId
   * @param {string} emoji
   * @param {number} authenticatedUserId
   * @returns {Promise<boolean>}
   */
  async removeReaction(messageId, emoji, authenticatedUserId) {
    if (!emoji) {
      throw new Error('Emoji is required');
    }

    return await reactionRepository.remove(messageId, authenticatedUserId, emoji.trim());
  },

  /**
   * Get reactions for a message
   *
   * @param {string} messageId
   * @returns {Promise<Array<object>>}
   */
  async getReactions(messageId) {
    return await reactionRepository.findByMessageId(messageId);
  },
};

export default chatService;
