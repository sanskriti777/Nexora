import { createClient } from 'redis';

let pubClient = null;
let subClient = null;
let redisStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable'

/**
 * Sanitize Redis URL for logging (strips password if present)
 *
 * @param {string} url
 * @returns {string}
 */
export function sanitizeRedisUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/(:)([^@/]+)(@)/, '$1***$3');
  }
}

/**
 * Connect to Redis and initialize pub/sub client pair
 *
 * @param {object} [options]
 * @param {string} [options.redisUrl]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @returns {Promise<{ pubClient: object|null, subClient: object|null, isConnected: boolean }>}
 */
export async function connectRedis(options = {}) {
  // If already connected, return existing clients
  if (pubClient?.isOpen && subClient?.isOpen) {
    return { pubClient, subClient, isConnected: true };
  }

  const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const cleanUrl = sanitizeRedisUrl(redisUrl);

  redisStatus = 'connecting';
  console.log(`[Redis] Connecting to ${cleanUrl}...`);

  try {
    const maxRetries = options.maxRetries ?? 2;
    const clientOptions = {
      url: redisUrl,
      socket: {
        connectTimeout: options.timeoutMs || 2000,
        reconnectStrategy: (retries) => {
          if (retries > maxRetries) {
            redisStatus = 'unavailable';
            return new Error('Max Redis reconnection attempts exceeded');
          }
          redisStatus = 'reconnecting';
          return Math.min(retries * 200, 1000);
        },
      },
    };

    pubClient = createClient(clientOptions);

    pubClient.on('error', (err) => {
      // Avoid unhandled error crashes
      if (redisStatus === 'connected') {
        console.warn(`[Redis] Connection error: ${err.message}`);
      }
    });

    pubClient.on('connect', () => {
      redisStatus = 'connected';
      console.log('[Redis] Connected');
    });

    pubClient.on('reconnecting', () => {
      redisStatus = 'reconnecting';
      console.log('[Redis] Reconnecting...');
    });

    pubClient.on('end', () => {
      redisStatus = 'disconnected';
      console.log('[Redis] Disconnected');
    });

    // Attempt primary client connection
    await pubClient.connect();

    // Create and connect subscriber duplicate
    subClient = pubClient.duplicate();
    subClient.on('error', (err) => {
      if (redisStatus === 'connected') {
        console.warn(`[Redis] Subscriber error: ${err.message}`);
      }
    });
    await subClient.connect();

    redisStatus = 'connected';
    return { pubClient, subClient, isConnected: true };
  } catch (err) {
    redisStatus = 'unavailable';
    console.warn(`[Redis] Unavailable (${err.message}) — running realtime server in single-node fallback mode.`);

    // Clean up attempted clients to prevent hanging handles
    try {
      if (pubClient) await pubClient.disconnect();
    } catch {
      // Ignore cleanup error
    }
    try {
      if (subClient) await subClient.disconnect();
    } catch {
      // Ignore cleanup error
    }

    pubClient = null;
    subClient = null;

    return { pubClient: null, subClient: null, isConnected: false };
  }
}

/**
 * Return current primary Redis client instance
 *
 * @returns {object|null}
 */
export function getRedisClient() {
  return pubClient;
}

/**
 * Return pub and sub clients for Socket.IO adapter
 *
 * @returns {{ pubClient: object|null, subClient: object|null }}
 */
export function getPubSubClients() {
  return { pubClient, subClient };
}

/**
 * Check whether Redis is ready and actively open
 *
 * @returns {boolean}
 */
export function isRedisReady() {
  return Boolean(pubClient?.isOpen && subClient?.isOpen);
}

/**
 * Get human-readable connection status
 *
 * @returns {'connected' | 'disconnected' | 'reconnecting' | 'unavailable' | 'connecting'}
 */
export function getRedisStatus() {
  if (isRedisReady()) return 'connected';
  return redisStatus;
}

/**
 * Manually set Redis clients for testing or mock injection
 *
 * @param {object|null} pub
 * @param {object|null} sub
 * @param {string} [status]
 */
export function setMockClients(pub, sub, status = 'connected') {
  pubClient = pub;
  subClient = sub;
  redisStatus = status;
}

/**
 * Disconnect Redis clients cleanly
 */
export async function disconnectRedis() {
  redisStatus = 'disconnected';
  const promises = [];
  if (pubClient) {
    promises.push(
      pubClient.disconnect().catch(() => {}).finally(() => {
        pubClient = null;
      })
    );
  }
  if (subClient) {
    promises.push(
      subClient.disconnect().catch(() => {}).finally(() => {
        subClient = null;
      })
    );
  }
  await Promise.all(promises);
  console.log('[Redis] Clients disconnected cleanly');
}

export default {
  connectRedis,
  getRedisClient,
  getPubSubClients,
  isRedisReady,
  getRedisStatus,
  setMockClients,
  disconnectRedis,
  sanitizeRedisUrl,
};
