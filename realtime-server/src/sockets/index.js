import { createSocketAuthMiddleware } from '../middleware/socketAuth.js';

/**
 * Initialize Socket.IO server handlers and authentication middleware
 *
 * @param {import('socket.io').Server} io
 * @param {object} [options]
 */
export function initSockets(io, options = {}) {
  // Apply Sanctum Bearer token authentication middleware to all incoming handshakes
  io.use(createSocketAuthMiddleware(options));

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${user?.name || 'Anonymous'}, ID: ${user?.id})`);

    // Infrastructure test event: realtime:ping -> realtime:pong
    socket.on('realtime:ping', () => {
      socket.emit('realtime:pong', {
        timestamp: Date.now(),
      });
    });

    // Handle clean disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return io;
}

export default initSockets;
