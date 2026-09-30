import express from 'express';
import cors from 'cors';
import { isDBConnected } from './config/database.js';

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
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Configure JSON parsing
  app.use(express.json());

  // Health endpoint
  app.get('/health', (req, res) => {
    const mongoConnected = isDBConnected();

    if (mongoConnected) {
      return res.status(200).json({
        status: 'ok',
        service: 'nexora-realtime',
        mongodb: 'connected',
      });
    }

    return res.status(503).json({
      status: 'degraded',
      service: 'nexora-realtime',
      mongodb: 'disconnected',
    });
  });

  return app;
}

export default createApp;
