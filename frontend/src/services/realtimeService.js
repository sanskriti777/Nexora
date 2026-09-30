import { io } from 'socket.io-client';
import authService, { AUTH_TOKEN_KEY } from './authService';

const REALTIME_URL = import.meta.env.VITE_REALTIME_URL || 'http://127.0.0.1:8002';

/**
 * Real-Time Socket Service for NEXORA
 *
 * Provides lazy Socket.IO connection lifecycle, Sanctum token authentication forwarding,
 * ping/pong latency measurement, and event listener abstractions.
 *
 * NOTE: Never logs or exposes raw authentication tokens.
 */
class RealtimeService {
  constructor() {
    this.socket = null;
    this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.listeners = new Map();
  }

  /**
   * Lazily establish a Socket.IO connection using current Sanctum auth token.
   *
   * @param {string} [tokenOverride] Optional explicit token override
   * @returns {import('socket.io-client').Socket}
   */
  connect(tokenOverride) {
    // If socket is already active and connected, return existing instance
    if (this.socket && (this.socket.connected || this.connectionState === 'connecting')) {
      return this.socket;
    }

    const token = tokenOverride || authService.getToken() || localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      console.warn('[Realtime] Cannot connect: No authentication token found.');
      return null;
    }

    this.connectionState = 'connecting';

    this.socket = io(REALTIME_URL, {
      auth: {
        token: token.trim(),
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      this.connectionState = 'connected';
      console.log('[Realtime] Connected to real-time server');
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionState = 'disconnected';
      console.log(`[Realtime] Disconnected from real-time server (${reason})`);
    });

    this.socket.on('connect_error', (error) => {
      this.connectionState = 'disconnected';
      console.error(`[Realtime] Connection error: ${error.message}`);
    });

    return this.socket;
  }

  /**
   * Disconnect cleanly from the real-time server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState = 'disconnected';
      console.log('[Realtime] Connection closed cleanly');
    }
  }

  /**
   * Check whether socket is actively connected
   *
   * @returns {boolean}
   */
  isConnected() {
    return Boolean(this.socket && this.socket.connected);
  }

  /**
   * Get current connection lifecycle status
   *
   * @returns {'disconnected' | 'connecting' | 'connected'}
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * Return the underlying Socket.IO client instance
   *
   * @returns {import('socket.io-client').Socket | null}
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Perform an infrastructure ping/pong test to measure round-trip latency
   *
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<{ latencyMs: number, serverTimestamp: number }>}
   */
  ping(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        return reject(new Error('Cannot send ping: Socket is not connected'));
      }

      const startTime = performance.now();
      let timer = null;

      const onPong = (payload) => {
        if (timer) clearTimeout(timer);
        const latencyMs = Math.round(performance.now() - startTime);
        resolve({
          latencyMs,
          serverTimestamp: payload?.timestamp || Date.now(),
        });
      };

      timer = setTimeout(() => {
        this.socket.off('realtime:pong', onPong);
        reject(new Error('Ping timeout: Server did not respond with realtime:pong within timeout'));
      }, timeoutMs);

      this.socket.once('realtime:pong', onPong);
      this.socket.emit('realtime:ping');
    });
  }

  /**
   * Subscribe to a real-time event
   *
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  /**
   * Unsubscribe from a real-time event
   *
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (this.socket) {
      this.socket.off(event, handler);
    }
  }
}

export const realtimeService = new RealtimeService();
export default realtimeService;
