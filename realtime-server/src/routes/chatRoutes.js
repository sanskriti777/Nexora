import { Router } from 'express';
import { chatController } from '../controllers/chatController.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createWorkspaceMiddleware } from '../middleware/workspaceMiddleware.js';

export function createChatRoutes(options = {}) {
  const router = Router();
  const authMiddleware = createAuthMiddleware(options);
  const workspaceMiddleware = createWorkspaceMiddleware(options);

  // Apply authentication & workspace context resolution
  router.use(authMiddleware);
  router.use(workspaceMiddleware);

  // Conversation routes
  router.get('/conversations', chatController.getConversations);
  router.post('/conversations', chatController.createConversation);
  router.get('/conversations/:id/messages', chatController.getConversationMessages);

  // Channel routes
  router.get('/channels', chatController.getChannels);
  router.post('/channels', chatController.createChannel);
  router.get('/channels/:id/messages', chatController.getChannelMessages);

  // Message routes
  router.post('/messages', chatController.sendMessage);
  router.patch('/messages/:id', chatController.editMessage);
  router.delete('/messages/:id', chatController.deleteMessage);

  // Reaction routes
  router.post('/messages/:id/reactions', chatController.addReaction);
  router.delete('/messages/:id/reactions', chatController.removeReaction);

  // Thread routes
  router.get('/threads/:rootMessageId', chatController.getThread);
  router.post('/threads/:rootMessageId/replies', chatController.createThreadReply);

  return router;
}

export default createChatRoutes;
