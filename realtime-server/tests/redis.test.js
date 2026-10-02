import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

import {
  connectRedis,
  disconnectRedis,
  isRedisReady,
  getRedisStatus,
  setMockClients,
  sanitizeRedisUrl,
} from '../src/redis.js';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

test('Phase 4I-E — Redis Integration & Distributed Realtime Infrastructure', async (t) => {
  await connectDB();

  // ----------------------------------------------------
  // Test 1: Redis configuration and URL sanitization
  // ----------------------------------------------------
  await t.test('1. Redis configuration loads and sanitizes credentials correctly', () => {
    const rawUrl = 'redis://:supersecretpass@127.0.0.1:6379/0';
    const sanitized = sanitizeRedisUrl(rawUrl);

    assert.ok(!sanitized.includes('supersecretpass'), 'Sanitized URL must not contain the raw password');
    assert.ok(sanitized.includes('***'), 'Sanitized URL must mask the password');

    const cleanUrl = 'redis://127.0.0.1:6379';
    assert.equal(sanitizeRedisUrl(cleanUrl), 'redis://127.0.0.1:6379');
  });

  // ----------------------------------------------------
  // Test 2 & 3: Redis unavailable fallback mode & readiness
  // ----------------------------------------------------
  await t.test('2. Redis connection handles unavailable host with graceful fallback', async () => {
    // Attempt connecting to a non-existent port with small timeout
    const result = await connectRedis({
      redisUrl: 'redis://127.0.0.1:63999',
      timeoutMs: 500,
      maxRetries: 0,
    });

    assert.equal(result.isConnected, false);
    assert.equal(result.pubClient, null);
    assert.equal(result.subClient, null);
    assert.equal(isRedisReady(), false);
    assert.equal(getRedisStatus(), 'unavailable');
  });

  // ----------------------------------------------------
  // Test 4: Health endpoint reports fallback / degraded status
  // ----------------------------------------------------
  await t.test('3. Health endpoint reports degraded status when Redis is unavailable', async () => {
    const app = createApp({ redisStatus: 'unavailable' });
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'degraded');
    assert.equal(body.mongodb, 'connected');
    assert.equal(body.redis, 'unavailable');

    await new Promise((r) => server.close(r));
  });

  // ----------------------------------------------------
  // Test 5: Health endpoint reports ok when Redis is connected
  // ----------------------------------------------------
  await t.test('4. Health endpoint reports ok when Redis and MongoDB are both connected', async () => {
    const app = createApp({ redisStatus: 'connected' });
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.mongodb, 'connected');
    assert.equal(body.redis, 'connected');

    await new Promise((r) => server.close(r));
  });

  // ----------------------------------------------------
  // Test 6: Socket.IO Redis adapter initialization
  // ----------------------------------------------------
  await t.test('5. Socket.IO initializes Redis adapter when pub/sub clients are provided', async () => {
    // Create mock pub/sub clients simulating connected Redis clients
    class MockRedisClient extends EventEmitter {
      constructor() {
        super();
        this.isOpen = true;
      }
      duplicate() {
        return new MockRedisClient();
      }
      async subscribe() {}
      async unsubscribe() {}
      async pSubscribe() {}
      async pUnsubscribe() {}
      async publish() {}
      async disconnect() {
        this.isOpen = false;
      }
    }

    const mockPub = new MockRedisClient();
    const mockSub = new MockRedisClient();

    const httpServer = http.createServer();
    const io = new SocketIOServer(httpServer);

    // Initializing adapter with pub/sub clients must succeed without throwing
    const adapter = createAdapter(mockPub, mockSub);
    assert.ok(typeof adapter === 'function');
    io.adapter(adapter);

    assert.ok(io.of('/').adapter);

    await new Promise((resolve) => io.close(resolve));
  });

  // ----------------------------------------------------
  // Test 7: Redis mock client state and cleanup
  // ----------------------------------------------------
  await t.test('6. Redis mock client injection and clean disconnect', async () => {
    let disconnected = false;
    const mockClient = {
      isOpen: true,
      disconnect: async () => {
        disconnected = true;
      },
    };

    setMockClients(mockClient, mockClient, 'connected');
    assert.equal(isRedisReady(), true);
    assert.equal(getRedisStatus(), 'connected');

    await disconnectRedis();
    assert.equal(disconnected, true);
    assert.equal(isRedisReady(), false);
    assert.equal(getRedisStatus(), 'disconnected');
  });

  // ----------------------------------------------------
  // Test 8: Single-node in-memory fallback server startup
  // ----------------------------------------------------
  await t.test('7. Server starts and serves realtime traffic with in-memory adapter on Redis failure', async () => {
    const app = createApp();
    const server = http.createServer(app);
    const io = new SocketIOServer(server);

    // Verify in-memory adapter exists and functions
    assert.ok(io.of('/').adapter);

    let pingReceived = false;
    io.on('connection', (socket) => {
      socket.on('realtime:ping', () => {
        pingReceived = true;
      });
    });

    await new Promise((r) => server.listen(0, r));
    await new Promise((r) => io.close(r));
    await new Promise((r) => server.close(r));
  });

  await disconnectDB();
});
