import { createSocketAuthMiddleware } from '../middleware/socketAuth.js';
import { conversationRepository } from '../repositories/conversationRepository.js';
import { channelRepository } from '../repositories/channelRepository.js';
import { messageRepository } from '../repositories/messageRepository.js';
import { chatService } from '../services/chatService.js';
import { presenceManager } from '../services/presenceService.js';
import { hasWorkspaceAccess } from '../utils/workspaceAuth.js';

/**
 * Initialize Socket.IO server handlers, presence management, and authentication middleware
 *
 * @param {import('socket.io').Server} io
 * @param {object} [options]
 */
export function initSockets(io, options = {}) {
  // Apply Sanctum Bearer token authentication middleware to all incoming handshakes
  io.use(createSocketAuthMiddleware(options));

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = user?.id;
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${user?.name || 'Anonymous'}, ID: ${userId})`);

    // Track active socket connection in in-memory presence manager
    if (userId) {
      presenceManager.addSocket(userId, socket.id);
      socket.join(`user:${userId}`); // For direct private routing (like notifications)
    }

    // Infrastructure test event: realtime:ping -> realtime:pong
    socket.on('realtime:ping', () => {
      socket.emit('realtime:pong', {
        timestamp: Date.now(),
      });
    });

    // Room join: Workspace (authorizes workspace access & updates presence)
    socket.on('chat:join:workspace', async ({ workspaceId }, callback) => {
      try {
        if (!workspaceId) return callback?.({ success: false, message: 'workspaceId required' });
        const wsId = Number(workspaceId);

        // Authoritative workspace validation using Laravel
        const allowed = await hasWorkspaceAccess(socket.data.token, wsId, options.laravelApiUrl);
        if (!allowed) {
          return callback?.({ success: false, message: 'Unauthorized: No access to this workspace' });
        }

        socket.join(`workspace:${wsId}`);
        await presenceManager.joinWorkspace(userId, wsId);

        // Broadcast presence update to authorized workspace members
        io.to(`workspace:${wsId}`).emit('presence:update', {
          userId,
          status: 'online',
        });

        const onlineUserIds = await presenceManager.getOnlineUsersInWorkspace(wsId);
        callback?.({ success: true, room: `workspace:${wsId}`, onlineUserIds });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Room leave: Workspace
    socket.on('chat:leave:workspace', async ({ workspaceId }) => {
      if (workspaceId) {
        const wsId = Number(workspaceId);
        socket.leave(`workspace:${wsId}`);
        await presenceManager.leaveWorkspace(userId, wsId);
      }
    });

    // Presence Subscription: Scoped to authorized workspace
    socket.on('presence:subscribe', async ({ workspaceId }, callback) => {
      try {
        if (!workspaceId) return callback?.({ success: false, message: 'workspaceId required' });
        const wsId = Number(workspaceId);

        const allowed = await hasWorkspaceAccess(socket.data.token, wsId, options.laravelApiUrl);
        if (!allowed) {
          return callback?.({ success: false, message: 'Unauthorized workspace access' });
        }

        socket.join(`workspace:${wsId}`);
        await presenceManager.joinWorkspace(userId, wsId);

        // Broadcast online presence to workspace
        io.to(`workspace:${wsId}`).emit('presence:update', {
          userId,
          status: 'online',
        });

        const onlineUserIds = await presenceManager.getOnlineUsersInWorkspace(wsId);
        callback?.({
          success: true,
          workspaceId: wsId,
          onlineUserIds,
        });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Room join: Conversation (authorizes participant)
    socket.on('chat:join:conversation', async ({ conversationId }, callback) => {
      try {
        if (!conversationId) return callback?.({ success: false, message: 'conversationId required' });
        const conv = await conversationRepository.findById(conversationId);
        if (!conv) return callback?.({ success: false, message: 'Conversation not found' });
        if (!conv.participantIds.includes(userId)) {
          return callback?.({ success: false, message: 'Unauthorized: Not a conversation participant' });
        }
        socket.join(`conversation:${conversationId}`);
        callback?.({ success: true, room: `conversation:${conversationId}` });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Room leave: Conversation
    socket.on('chat:leave:conversation', ({ conversationId }) => {
      if (conversationId) socket.leave(`conversation:${conversationId}`);
    });

    // Room join: Channel (authorizes member / public access)
    socket.on('chat:join:channel', async ({ channelId }, callback) => {
      try {
        if (!channelId) return callback?.({ success: false, message: 'channelId required' });
        const chan = await channelRepository.findById(channelId);
        if (!chan) return callback?.({ success: false, message: 'Channel not found' });
        if (chan.isPrivate && chan.createdBy !== userId && !chan.memberIds.includes(userId)) {
          return callback?.({ success: false, message: 'Unauthorized: Private channel access denied' });
        }
        socket.join(`channel:${channelId}`);
        callback?.({ success: true, room: `channel:${channelId}` });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Room leave: Channel
    socket.on('chat:leave:channel', ({ channelId }) => {
      if (channelId) socket.leave(`channel:${channelId}`);
    });

    // Room join: Thread
    socket.on('chat:join:thread', ({ threadId }, callback) => {
      if (!threadId) return callback?.({ success: false, message: 'threadId required' });
      socket.join(`thread:${threadId}`);
      callback?.({ success: true, room: `thread:${threadId}` });
    });

    // Room leave: Thread
    socket.on('chat:leave:thread', ({ threadId }) => {
      if (threadId) socket.leave(`thread:${threadId}`);
    });

    // Typing Indicators: Start typing (scoped to active chat room)
    socket.on('chat:typing:start', ({ channelId, conversationId }) => {
      if (!userId) return;
      const targetRoom = channelId
        ? `channel:${channelId}`
        : conversationId
        ? `conversation:${conversationId}`
        : null;
      if (!targetRoom) return;

      // Ensure user is authorized & has joined target room
      if (!socket.rooms.has(targetRoom)) return;

      // Broadcast to room excluding sender; client-supplied userId is strictly ignored
      socket.to(targetRoom).emit('chat:typing:update', {
        userId,
        isTyping: true,
        channelId: channelId || null,
        conversationId: conversationId || null,
      });
    });

    // Typing Indicators: Stop typing (scoped to active chat room)
    socket.on('chat:typing:stop', ({ channelId, conversationId }) => {
      if (!userId) return;
      const targetRoom = channelId
        ? `channel:${channelId}`
        : conversationId
        ? `conversation:${conversationId}`
        : null;
      if (!targetRoom) return;

      if (!socket.rooms.has(targetRoom)) return;

      socket.to(targetRoom).emit('chat:typing:update', {
        userId,
        isTyping: false,
        channelId: channelId || null,
        conversationId: conversationId || null,
      });
    });

    // Event: Send Message via WebSocket
    socket.on('chat:message:send', async (payload, callback) => {
      try {
        const { workspaceId, conversationId, channelId, content, replyToMessageId, threadId, messageType } = payload;
        const message = await chatService.createMessage(
          {
            workspaceId,
            conversationId,
            channelId,
            content,
            replyToMessageId,
            threadId,
            messageType,
          },
          userId
        );

        const targetRoom = conversationId ? `conversation:${conversationId}` : `channel:${channelId}`;
        io.to(targetRoom).emit('chat:message:new', message);
        io.to(`workspace:${workspaceId}`).emit('chat:message:new', message);
        if (threadId) {
          io.to(`thread:${threadId}`).emit('chat:message:new', message);
        }

        callback?.({ success: true, data: message });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Event: Edit Message via WebSocket
    socket.on('chat:message:edit', async ({ messageId, content }, callback) => {
      try {
        const updated = await chatService.editMessage(messageId, content, userId);
        const targetRoom = updated.conversationId
          ? `conversation:${updated.conversationId}`
          : `channel:${updated.channelId}`;
        io.to(targetRoom).emit('chat:message:updated', updated);
        callback?.({ success: true, data: updated });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Event: Delete Message via WebSocket
    socket.on('chat:message:delete', async ({ messageId }, callback) => {
      try {
        const deleted = await chatService.softDeleteMessage(messageId, userId);
        const targetRoom = deleted.conversationId
          ? `conversation:${deleted.conversationId}`
          : `channel:${deleted.channelId}`;
        io.to(targetRoom).emit('chat:message:deleted', {
          _id: deleted._id,
          deletedAt: deleted.deletedAt,
        });
        callback?.({ success: true, data: deleted });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Event: Add Reaction via WebSocket
    socket.on('chat:reaction:add', async ({ messageId, emoji }, callback) => {
      try {
        const reaction = await chatService.addReaction(messageId, emoji, userId);
        const msg = await messageRepository.findById(messageId);
        if (msg) {
          const room = msg.conversationId ? `conversation:${msg.conversationId}` : `channel:${msg.channelId}`;
          io.to(room).emit('chat:reaction:add', reaction);
        }
        callback?.({ success: true, data: reaction });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Event: Remove Reaction via WebSocket
    socket.on('chat:reaction:remove', async ({ messageId, emoji }, callback) => {
      try {
        const success = await chatService.removeReaction(messageId, emoji, userId);
        const msg = await messageRepository.findById(messageId);
        if (msg) {
          const room = msg.conversationId ? `conversation:${msg.conversationId}` : `channel:${msg.channelId}`;
          io.to(room).emit('chat:reaction:remove', {
            messageId,
            userId,
            emoji,
          });
        }
        callback?.({ success: true, removed: success });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    });

    // Handle clean disconnect with multi-socket presence tracking
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
      const result = await presenceManager.removeSocket(socket.id);
      if (result.isLastSocket && result.userId) {
        // Broadcast offline status to all workspaces the user participated in
        for (const wsId of result.workspaces) {
          io.to(`workspace:${wsId}`).emit('presence:update', {
            userId: result.userId,
            status: 'offline',
            lastSeenAt: result.lastSeenAt,
          });
        }
      }
    });
  });

  return io;
}

export default initSockets;
