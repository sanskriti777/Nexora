import express from 'express';
import cors from 'cors';
import { isDBConnected } from './config/database.js';
import { getRedisStatus } from './redis.js';
import { createChatRoutes } from './routes/chatRoutes.js';

/**
 * Configure and return Express application
 *
 * @param {object} [options]
 * @returns {import('express').Express}
 */
export function createApp(options = {}) {
  const app = express();

  const allowedOrigins = [
    options.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  // Configure CORS
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. server-to-server or health probes)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS origin not allowed: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    })
  );

  // Configure JSON parsing
  app.use(express.json());

  // Health endpoint with infrastructure reporting for MongoDB and Redis
  app.get('/health', (req, res) => {
    const mongoConnected = isDBConnected();
    const redisStatus = options.redisStatus || getRedisStatus();
    const isRedisOk = redisStatus === 'connected';

    if (mongoConnected && isRedisOk) {
      return res.status(200).json({
        status: 'ok',
        service: 'nexora-realtime',
        mongo: 'connected',
        mongodb: 'connected',
        redis: 'connected',
      });
    }

    if (mongoConnected) {
      return res.status(200).json({
        status: 'degraded',
        service: 'nexora-realtime',
        mongo: 'connected',
        mongodb: 'connected',
        redis: redisStatus,
      });
    }

    return res.status(503).json({
      status: 'degraded',
      service: 'nexora-realtime',
      mongo: 'disconnected',
      mongodb: 'disconnected',
      redis: redisStatus,
    });
  });

  // Mount Chat REST API
  app.use('/api/chat', createChatRoutes(options));

  // Mount internal notification bridge (from Laravel)
  app.post('/internal/notifications', (req, res) => {
    const internalSecret = req.headers['x-internal-secret'];
    const expectedSecret = options.internalSecret || process.env.INTERNAL_SECRET || 'nexora-internal-secret';

    if (internalSecret !== expectedSecret) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { notification } = req.body;
    if (!notification || !notification.userId) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const io = options.io || req.app.get('io');
    if (io) {
      io.to(`user:${notification.userId}`).emit('notification:new', notification);
    }

    return res.status(200).json({ success: true, message: 'Notification broadcasted' });
  });

  return app;
}

export default createApp;
