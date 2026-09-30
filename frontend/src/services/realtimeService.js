import { io } from 'socket.io-client';
import authService, { AUTH_TOKEN_KEY } from './authService';

const REALTIME_URL = import.meta.env.VITE_REALTIME_URL || 'http://127.0.0.1:8002';

/**
 * Real-Time Socket Service for NEXORA
 *
 * Provides lazy Socket.IO connection lifecycle, Sanctum token authentication forwarding,
 * connection status subscriptions, automatic reconnection with backoff,
 * ping/pong latency measurement, and event listener abstractions.
 *
 * NOTE: Never logs or exposes raw authentication tokens.
 */
class RealtimeService {
  constructor() {
    this.socket = null;
    this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
    this.listeners = new Map();
    this.connectionListeners = new Set();
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

    this.setConnectionState('connecting');

    this.socket = io(REALTIME_URL, {
      auth: {
        token: token.trim(),
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      this.setConnectionState('connected');
      console.log('[Realtime] Connected to real-time server');
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this.setConnectionState('disconnected');
      } else {
        // Socket disconnected unexpectedly; transport reconnection will fire
        this.setConnectionState('reconnecting');
      }
      console.log(`[Realtime] Disconnected from real-time server (${reason})`);
    });

    this.socket.on('connect_error', (error) => {
      if (this.socket?.active) {
        this.setConnectionState('reconnecting');
      } else {
        this.setConnectionState('error');
      }
      console.error(`[Realtime] Connection error: ${error.message}`);
    });

    if (this.socket.io) {
      this.socket.io.on('reconnect_attempt', () => {
        this.setConnectionState('reconnecting');
      });

      this.socket.io.on('reconnect', () => {
        this.setConnectionState('connected');
        console.log('[Realtime] Successfully reconnected to real-time server');
      });

      this.socket.io.on('reconnect_failed', () => {
        this.setConnectionState('disconnected');
        console.warn('[Realtime] Reconnection attempts exhausted');
      });
    }

    return this.socket;
  }

  /**
   * Disconnect cleanly from the real-time server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.setConnectionState('disconnected');
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
   * @returns {'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'}
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * Update connection state and notify all registered listeners
   *
   * @param {'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'} newState
   */
  setConnectionState(newState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.connectionListeners.forEach((fn) => {
        try {
          fn(newState);
        } catch (err) {
          console.error('[Realtime] Error in connection listener:', err);
        }
      });
    }
  }

  /**
   * Register a listener for connection state changes
   *
   * @param {function('disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'): void} listener
   * @returns {function(): void} Unsubscribe callback
   */
  onConnectionStateChange(listener) {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
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
