import { chatService } from '../services/chatService.js';
import { conversationRepository } from '../repositories/conversationRepository.js';
import { channelRepository } from '../repositories/channelRepository.js';
import { messageRepository } from '../repositories/messageRepository.js';
import { threadRepository } from '../repositories/threadRepository.js';

/**
 * Chat Controller
 *
 * Handles HTTP requests for chat resources, verifies authorization,
 * delegates to chatService/repositories, and emits Socket.IO realtime events.
 */
export const chatController = {
  /**
   * GET /api/chat/conversations
   */
  async getConversations(req, res) {
    try {
      const conversations = await conversationRepository.findByUserAndWorkspace(
        req.workspaceId,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (err) {
      console.error('[ChatController] Error fetching conversations:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/chat/conversations
   */
  async createConversation(req, res) {
    try {
      const { type = 'direct', participantIds = [] } = req.body;

      if (!Array.isArray(participantIds)) {
        return res.status(422).json({
          success: false,
          message: 'participantIds must be an array of user IDs',
        });
      }

      const conversation = await chatService.createConversation(
        {
          workspaceId: req.workspaceId,
          type,
          participantIds,
        },
        req.user.id
      );

      return res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      return res.status(422).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/chat/conversations/:id/messages
   */
  async getConversationMessages(req, res) {
    try {
      const { id } = req.params;
      const conversation = await conversationRepository.findById(id);

      if (!conversation || conversation.workspaceId !== req.workspaceId) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found in active workspace',
        });
      }

      if (!conversation.participantIds.includes(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not a participant in this conversation',
        });
      }

      let beforeCursor = null;
      if (req.query.beforeCursor) {
        try {
          beforeCursor =
            typeof req.query.beforeCursor === 'string'
              ? JSON.parse(req.query.beforeCursor)
              : req.query.beforeCursor;
        } catch {
          beforeCursor = null;
        }
      }

      const limit = parseInt(req.query.limit, 10) || 30;

      const result = await chatService.getMessages({
        workspaceId: req.workspaceId,
        conversationId: id,
        beforeCursor,
        limit,
      });

      return res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination,
      });
    } catch (err) {
      console.error('[ChatController] Error fetching conversation messages:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/chat/channels
   */
  async getChannels(req, res) {
    try {
      const teamId = req.query.team_id ? parseInt(req.query.team_id, 10) : null;
      const allChannels = await channelRepository.findByWorkspace(req.workspaceId, teamId);

      // Filter: public channels or private channels user is member of or created
      const accessibleChannels = allChannels.filter((chan) => {
        if (!chan.isPrivate) return true;
        return chan.createdBy === req.user.id || chan.memberIds.includes(req.user.id);
      });

      return res.status(200).json({
        success: true,
        data: accessibleChannels,
      });
    } catch (err) {
      console.error('[ChatController] Error fetching channels:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/chat/channels
   */
  async createChannel(req, res) {
    try {
      const { name, description = '', isPrivate = false, teamId = null, memberIds = [] } = req.body;

      const channel = await chatService.createChannel(
        {
          workspaceId: req.workspaceId,
          teamId,
          name,
          description,
          isPrivate,
          memberIds,
        },
        req.user.id
      );

      return res.status(201).json({
        success: true,
        data: channel,
      });
    } catch (err) {
      return res.status(422).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/chat/channels/:id/messages
   */
  async getChannelMessages(req, res) {
    try {
      const { id } = req.params;
      const channel = await channelRepository.findById(id);

      if (!channel || channel.workspaceId !== req.workspaceId) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found in active workspace',
        });
      }

      if (channel.isPrivate && channel.createdBy !== req.user.id && !channel.memberIds.includes(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have access to this private channel',
        });
      }

      let beforeCursor = null;
      if (req.query.beforeCursor) {
        try {
          beforeCursor =
            typeof req.query.beforeCursor === 'string'
              ? JSON.parse(req.query.beforeCursor)
              : req.query.beforeCursor;
        } catch {
          beforeCursor = null;
        }
      }

      const limit = parseInt(req.query.limit, 10) || 30;

      const result = await chatService.getMessages({
        workspaceId: req.workspaceId,
        channelId: id,
        beforeCursor,
        limit,
      });

      return res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination,
      });
    } catch (err) {
      console.error('[ChatController] Error fetching channel messages:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/chat/messages
   */
  async sendMessage(req, res) {
    try {
      const { conversationId, channelId, content, replyToMessageId, threadId, messageType = 'text' } = req.body;

      if (!content || typeof content !== 'string' || content.trim() === '') {
        return res.status(422).json({
          success: false,
          message: 'Message content is required',
        });
      }

      // Check destination access
      if (conversationId) {
        const conv = await conversationRepository.findById(conversationId);
        if (!conv || conv.workspaceId !== req.workspaceId) {
          return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (!conv.participantIds.includes(req.user.id)) {
          return res.status(403).json({ success: false, message: 'Access denied to this conversation' });
        }
      } else if (channelId) {
        const chan = await channelRepository.findById(channelId);
        if (!chan || chan.workspaceId !== req.workspaceId) {
          return res.status(404).json({ success: false, message: 'Channel not found' });
        }
        if (chan.isPrivate && chan.createdBy !== req.user.id && !chan.memberIds.includes(req.user.id)) {
          return res.status(403).json({ success: false, message: 'Access denied to this private channel' });
        }
      } else {
        return res.status(422).json({
          success: false,
          message: 'Message must have either conversationId or channelId',
        });
      }

      const message = await chatService.createMessage(
        {
          workspaceId: req.workspaceId,
          conversationId,
          channelId,
          content,
          replyToMessageId,
          threadId,
          messageType,
        },
        req.user.id
      );

      // Realtime broadcast via Socket.IO
      const io = req.app.get('io');
      if (io) {
        const targetRoom = conversationId ? `conversation:${conversationId}` : `channel:${channelId}`;
        io.to(targetRoom).emit('chat:message:new', message);
        io.to(`workspace:${req.workspaceId}`).emit('chat:message:new', message);
        if (threadId) {
          io.to(`thread:${threadId}`).emit('chat:message:new', message);
        }
      }

      return res.status(201).json({
        success: true,
        data: message,
      });
    } catch (err) {
      console.error('[ChatController] Error creating message:', err.message);
      return res.status(422).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/chat/messages/:id
   */
  async editMessage(req, res) {
    try {
      const { id } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim() === '') {
        return res.status(422).json({ success: false, message: 'Content is required' });
      }

      const updated = await chatService.editMessage(id, content, req.user.id);

      const io = req.app.get('io');
      if (io) {
        const targetRoom = updated.conversationId
          ? `conversation:${updated.conversationId}`
          : `channel:${updated.channelId}`;
        io.to(targetRoom).emit('chat:message:updated', updated);
      }

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      const status = err.message.includes('Unauthorized') ? 403 : err.message.includes('not found') ? 404 : 422;
      return res.status(status).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/chat/messages/:id
   */
  async deleteMessage(req, res) {
    try {
      const { id } = req.params;
      const deleted = await chatService.softDeleteMessage(id, req.user.id);

      const io = req.app.get('io');
      if (io) {
        const targetRoom = deleted.conversationId
          ? `conversation:${deleted.conversationId}`
          : `channel:${deleted.channelId}`;
        io.to(targetRoom).emit('chat:message:deleted', {
          _id: deleted._id,
          deletedAt: deleted.deletedAt,
        });
      }

      return res.status(200).json({
        success: true,
        data: deleted,
      });
    } catch (err) {
      const status = err.message.includes('Unauthorized') ? 403 : err.message.includes('not found') ? 404 : 422;
      return res.status(status).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/chat/messages/:id/reactions
   */
  async addReaction(req, res) {
    try {
      const { id } = req.params;
      const { emoji } = req.body;

      if (!emoji || typeof emoji !== 'string' || emoji.trim() === '') {
        return res.status(422).json({ success: false, message: 'Emoji is required' });
      }

      const reaction = await chatService.addReaction(id, emoji, req.user.id);

      const io = req.app.get('io');
      if (io) {
        const msg = await messageRepository.findById(id);
        if (msg) {
          const room = msg.conversationId ? `conversation:${msg.conversationId}` : `channel:${msg.channelId}`;
          io.to(room).emit('chat:reaction:add', reaction);
        }
      }

      return res.status(200).json({
        success: true,
        data: reaction,
      });
    } catch (err) {
      return res.status(422).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/chat/messages/:id/reactions
   */
  async removeReaction(req, res) {
    try {
      const { id } = req.params;
      const emoji = req.query.emoji || req.body?.emoji;

      if (!emoji) {
        return res.status(422).json({ success: false, message: 'Emoji is required' });
      }

      const success = await chatService.removeReaction(id, emoji, req.user.id);

      const io = req.app.get('io');
      if (io) {
        const msg = await messageRepository.findById(id);
        if (msg) {
          const room = msg.conversationId ? `conversation:${msg.conversationId}` : `channel:${msg.channelId}`;
          io.to(room).emit('chat:reaction:remove', {
            messageId: id,
            userId: req.user.id,
            emoji,
          });
        }
      }

      return res.status(200).json({
        success,
        message: success ? 'Reaction removed' : 'Reaction not found',
      });
    } catch (err) {
      return res.status(422).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/chat/threads/:rootMessageId
   */
  async getThread(req, res) {
    try {
      const { rootMessageId } = req.params;
      const rootMessage = await messageRepository.findById(rootMessageId);

      if (!rootMessage || rootMessage.workspaceId !== req.workspaceId) {
        return res.status(404).json({ success: false, message: 'Root message not found in active workspace' });
      }

      const thread = await threadRepository.findByRootMessageId(rootMessageId);
      let replies = [];

      if (thread) {
        const result = await chatService.getMessages({
          workspaceId: req.workspaceId,
          threadId: thread._id.toString(),
          limit: 50,
        });
        replies = result.messages.filter((m) => m._id.toString() !== rootMessageId.toString());
      }

      return res.status(200).json({
        success: true,
        data: {
          rootMessage,
          thread,
          replies,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/chat/threads/:rootMessageId/replies
   */
  async createThreadReply(req, res) {
    try {
      const { rootMessageId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim() === '') {
        return res.status(422).json({ success: false, message: 'Content is required' });
      }

      const rootMessage = await messageRepository.findById(rootMessageId);
      if (!rootMessage || rootMessage.workspaceId !== req.workspaceId) {
        return res.status(404).json({ success: false, message: 'Root message not found' });
      }

      // Ensure thread exists or create it
      const thread = await chatService.createThread(rootMessageId, req.user.id);

      const reply = await chatService.createMessage(
        {
          workspaceId: req.workspaceId,
          conversationId: rootMessage.conversationId ? rootMessage.conversationId.toString() : null,
          channelId: rootMessage.channelId ? rootMessage.channelId.toString() : null,
          content,
          replyToMessageId: rootMessage._id.toString(),
          threadId: thread._id.toString(),
        },
        req.user.id
      );

      const io = req.app.get('io');
      if (io) {
        io.to(`thread:${thread._id}`).emit('chat:message:new', reply);
        const parentRoom = rootMessage.conversationId
          ? `conversation:${rootMessage.conversationId}`
          : `channel:${rootMessage.channelId}`;
        io.to(parentRoom).emit('chat:thread:new', { thread, reply });
      }

      return res.status(201).json({
        success: true,
        data: reply,
      });
    } catch (err) {
      return res.status(422).json({ success: false, message: err.message });
    }
  },
};

export default chatController;
