import { isRedisReady, getRedisClient } from '../redis.js';

/**
 * Distributed & In-Memory Presence Manager
 *
 * Tracks active Socket.IO connections and user presence state.
 * Maintains instantaneous in-memory lookups for performance and backwards compatibility,
 * and asynchronously synchronizes with Redis when available for multi-node clustering:
 *   - nexora:presence:user:{userId} -> Set of active socket IDs
 *   - nexora:presence:ws:{workspaceId} -> Set of active user IDs
 *   - nexora:presence:last_seen:{userId} -> String timestamp
 *
 * Rule: Authenticated user identity (socket.data.user.id) is authoritative.
 * Rule: A user can have multiple sockets/devices. Only mark offline when all sockets disconnect.
 * Rule: Presence is ephemeral and never written to MongoDB.
 */

class PresenceManager {
  constructor() {
    /** @type {Map<number, Set<string>>} userId -> Set of active socket IDs */
    this.userSockets = new Map();

    /** @type {Map<string, number>} socketId -> userId */
    this.socketToUser = new Map();

    /** @type {Map<number, Set<number>>} userId -> Set of active workspace IDs */
    this.userWorkspaces = new Map();

    /** @type {Map<number, number>} userId -> lastSeenAt timestamp (ms) */
    this.lastSeen = new Map();
  }

  /**
   * Register an authenticated socket connection for a user
   *
   * @param {number} userId
   * @param {string} socketId
   * @returns {{ isFirstSocket: boolean, userId: number, status: 'online' }}
   */
  addSocket(userId, socketId) {
    const id = Number(userId);
    let socketSet = this.userSockets.get(id);
    const isFirstSocket = !socketSet || socketSet.size === 0;

    if (!socketSet) {
      socketSet = new Set();
      this.userSockets.set(id, socketSet);
    }
    socketSet.add(socketId);
    this.socketToUser.set(socketId, id);

    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        if (redis?.isOpen) {
          const key = `nexora:presence:user:${id}`;
          redis.sAdd(key, socketId).catch(() => {});
          redis.expire(key, 86400).catch(() => {});
        }
      } catch (err) {
        console.warn(`[Presence] Redis addSocket error: ${err.message}`);
      }
    }

    return {
      isFirstSocket,
      userId: id,
      status: 'online',
    };
  }

  /**
   * Track user participation in a workspace
   *
   * @param {number} userId
   * @param {number} workspaceId
   */
  joinWorkspace(userId, workspaceId) {
    const uId = Number(userId);
    const wsId = Number(workspaceId);
    let wsSet = this.userWorkspaces.get(uId);
    if (!wsSet) {
      wsSet = new Set();
      this.userWorkspaces.set(uId, wsSet);
    }
    wsSet.add(wsId);

    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        if (redis?.isOpen) {
          const key = `nexora:presence:ws:${wsId}`;
          redis.sAdd(key, String(uId)).catch(() => {});
          redis.expire(key, 86400).catch(() => {});
        }
      } catch (err) {
        console.warn(`[Presence] Redis joinWorkspace error: ${err.message}`);
      }
    }
  }

  /**
   * Remove user participation from a workspace
   *
   * @param {number} userId
   * @param {number} workspaceId
   */
  leaveWorkspace(userId, workspaceId) {
    const uId = Number(userId);
    const wsId = Number(workspaceId);
    const wsSet = this.userWorkspaces.get(uId);
    if (wsSet) {
      wsSet.delete(wsId);
      if (wsSet.size === 0) {
        this.userWorkspaces.delete(uId);
      }
    }

    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        if (redis?.isOpen) {
          redis.sRem(`nexora:presence:ws:${wsId}`, String(uId)).catch(() => {});
        }
      } catch (err) {
        console.warn(`[Presence] Redis leaveWorkspace error: ${err.message}`);
      }
    }
  }

  /**
   * Remove a socket when it disconnects
   *
   * @param {string} socketId
   * @returns {{ isLastSocket: boolean, userId: number|null, status: 'online'|'offline', lastSeenAt: number|null, workspaces: number[] }}
   */
  removeSocket(socketId) {
    const userId = this.socketToUser.get(socketId);
    this.socketToUser.delete(socketId);

    if (!userId) {
      return {
        isLastSocket: false,
        userId: null,
        status: 'offline',
        lastSeenAt: null,
        workspaces: [],
      };
    }

    const socketSet = this.userSockets.get(userId);
    if (socketSet) {
      socketSet.delete(socketId);
    }

    const remaining = socketSet ? socketSet.size : 0;
    const workspaces = Array.from(this.userWorkspaces.get(userId) || []);
    const isLast = remaining === 0;
    const lastSeenAt = Date.now();

    if (isLast) {
      this.userSockets.delete(userId);
      this.lastSeen.set(userId, lastSeenAt);
    }

    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        if (redis?.isOpen) {
          const userKey = `nexora:presence:user:${userId}`;
          redis.sRem(userKey, socketId).catch(() => {});
          if (isLast) {
            redis.set(`nexora:presence:last_seen:${userId}`, String(lastSeenAt)).catch(() => {});
            for (const wsId of workspaces) {
              redis.sRem(`nexora:presence:ws:${wsId}`, String(userId)).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn(`[Presence] Redis removeSocket error: ${err.message}`);
      }
    }

    return {
      isLastSocket: isLast,
      userId,
      status: isLast ? 'offline' : 'online',
      lastSeenAt: isLast ? lastSeenAt : null,
      workspaces,
    };
  }

  /**
   * Check whether a specific user is currently online
   *
   * @param {number} userId
   * @returns {boolean}
   */
  isUserOnline(userId) {
    const socketSet = this.userSockets.get(Number(userId));
    return Boolean(socketSet && socketSet.size > 0);
  }

  /**
   * Get all currently online user IDs in an authorized workspace
   *
   * @param {number} workspaceId
   * @returns {number[]}
   */
  getOnlineUsersInWorkspace(workspaceId) {
    const wsId = Number(workspaceId);
    const online = [];
    for (const [userId, wsSet] of this.userWorkspaces.entries()) {
      if (wsSet.has(wsId) && this.isUserOnline(userId)) {
        online.push(userId);
      }
    }
    return online;
  }

  /**
   * Get the last recorded active timestamp for a user
   *
   * @param {number} userId
   * @returns {number|null}
   */
  getLastSeen(userId) {
    return this.lastSeen.get(Number(userId)) || null;
  }

  /**
   * Reset all memory state (for test isolation)
   */
  clear() {
    this.userSockets.clear();
    this.socketToUser.clear();
    this.userWorkspaces.clear();
    this.lastSeen.clear();
  }
}

export const presenceManager = new PresenceManager();
export default presenceManager;
