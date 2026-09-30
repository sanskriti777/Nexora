import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/database.js';
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

initSockets(io);

/**
 * Start the HTTP and Socket.IO server
 *
 * @param {number} [portOverride]
 * @returns {Promise<{ server: http.Server, io: SocketIOServer }>}
 */
export async function startServer(portOverride) {
  const listenPort = portOverride || PORT;

  try {
    // Attempt MongoDB connection
    await connectDB();
  } catch (error) {
    console.warn(`[Server] Warning: Failed to connect to MongoDB on startup (${error.message}). Running in degraded mode.`);
  }

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
 * Gracefully stop the server and disconnect database
 */
export async function stopServer() {
  return new Promise((resolve) => {
    io.close(() => {
      httpServer.close(async () => {
        await disconnectDB();
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

  const handleShutdown = async (signal) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    await stopServer();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

export { app, httpServer, io };
export default httpServer;
