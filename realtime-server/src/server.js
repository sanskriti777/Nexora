import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/database.js';
import { connectRedis, disconnectRedis, getPubSubClients, isRedisReady } from './redis.js';
import { initSockets } from './sockets/index.js';

const PORT = parseInt(process.env.PORT, 10) || 8002;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = createApp();
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [FRONTEND_URL, 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.set('io', io);

initSockets(io);

/**
 * Start the HTTP and Socket.IO server with deterministic startup sequence:
 * 1. Connect MongoDB
 * 2. Connect Redis
 * 3. Configure Socket.IO Redis adapter (or fallback to in-memory)
 * 4. Start HTTP listening
 *
 * @param {number} [portOverride]
 * @param {object} [options]
 * @returns {Promise<{ server: http.Server, io: SocketIOServer }>}
 */
export async function startServer(portOverride, options = {}) {
  const listenPort = portOverride || PORT;

  try {
    // 1. Connect MongoDB
    await connectDB();
  } catch (error) {
    console.warn(`[Server] Warning: Failed to connect to MongoDB on startup (${error.message}). Running in degraded mode.`);
  }

  try {
    // 2. Connect Redis
    const { pubClient, subClient, isConnected } = await connectRedis(options);

    // 3. Configure Socket.IO Redis adapter
    if (isConnected && pubClient && subClient) {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] Redis adapter enabled for distributed cross-instance coordination');
    } else {
      console.log('[Socket.IO] Running with in-memory adapter (single-node fallback)');
    }
  } catch (redisError) {
    console.warn(`[Socket.IO] Redis adapter initialization skipped (${redisError.message}). Running in fallback mode.`);
  }

  // 4. Start HTTP listening
  return new Promise((resolve, reject) => {
    httpServer.listen(listenPort, () => {
      console.log(`[Server] NEXORA Realtime Server running on port ${listenPort}`);
      console.log(`[Server] Allowed Frontend Origin: ${FRONTEND_URL}`);
      resolve({ server: httpServer, io });
    });

    httpServer.once('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Gracefully stop the server, disconnect Redis clients, and disconnect database
 */
export async function stopServer() {
  return new Promise((resolve) => {
    io.close(async () => {
      httpServer.close(async () => {
        try {
          await disconnectRedis();
        } catch {
          // Ignore cleanup error
        }
        try {
          await disconnectDB();
        } catch {
          // Ignore cleanup error
        }
        resolve();
      });
    });
  });
}

// Automatically start if executed as primary process
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  });
}
