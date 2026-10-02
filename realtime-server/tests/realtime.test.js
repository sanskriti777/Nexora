import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import express from 'express';

import { createApp } from '../src/app.js';
import { connectDB, disconnectDB, isDBConnected } from '../src/config/database.js';
import { createSocketAuthMiddleware } from '../src/middleware/socketAuth.js';
import { initSockets } from '../src/sockets/index.js';

test('1. MongoDB Connection Lifecycle', async (t) => {
  await t.test('connects successfully to local MongoDB instance', async () => {
    await connectDB();
    assert.equal(isDBConnected(), true, 'Database should report connected');
  });

  await t.test('disconnects cleanly', async () => {
    await disconnectDB();
    assert.equal(isDBConnected(), false, 'Database should report disconnected');
  });
});

test('2. Health Endpoint Behavior', async (t) => {
  const app = createApp();

  await t.test('returns 503 degraded when MongoDB is disconnected', async () => {
    // Ensure disconnected
    await disconnectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.status, 'degraded');
      assert.equal(body.mongodb, 'disconnected');
      assert.equal(body.service, 'nexora-realtime');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('returns 200 when MongoDB is connected', async () => {
    await connectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.status === 'ok' || body.status === 'degraded');
      assert.equal(body.mongodb, 'connected');
      assert.equal(body.service, 'nexora-realtime');
      assert.ok(body.redis);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await disconnectDB();
    }
  });
});

test('3. Socket.IO Authentication Middleware Unit Verification', async (t) => {
  await t.test('rejects connection when handshake token is missing', async () => {
    const middleware = createSocketAuthMiddleware();
    const fakeSocket = {
      handshake: { auth: {}, headers: {} },
      data: {},
    };

    let errorResult = null;
    await middleware(fakeSocket, (err) => {
      errorResult = err;
    });

    assert.ok(errorResult, 'Expected error for missing token');
    assert.match(errorResult.message, /Missing token/i);
  });

  await t.test('rejects connection when auth service is unreachable', async () => {
    // Port 59999 is unused and will immediately fail connection
    const middleware = createSocketAuthMiddleware({
      laravelApiUrl: 'http://127.0.0.1:59999',
      timeoutMs: 500,
    });

    const fakeSocket = {
      handshake: { auth: { token: 'mock-token' }, headers: {} },
      data: {},
    };

    let errorResult = null;
    await middleware(fakeSocket, (err) => {
      errorResult = err;
    });

    assert.ok(errorResult, 'Expected error for unreachable service');
    assert.match(errorResult.message, /Auth service unreachable/i);
  });
});

test('4. End-to-End Socket.IO Connection and Event Lifecycle', async (t) => {
  // Set up a mock Laravel authentication server to test handshake flows deterministically
  const mockLaravelApp = express();
  mockLaravelApp.use(express.json());

  mockLaravelApp.get('/api/me', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader === 'Bearer valid-test-sanctum-token') {
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: 99,
            name: 'Verification User',
            email: 'verify@nexora.test',
          },
        },
      });
    }

    return res.status(401).json({
      message: 'Unauthenticated.',
    });
  });

  const mockLaravelServer = http.createServer(mockLaravelApp);
  await new Promise((resolve) => mockLaravelServer.listen(0, resolve));
  const mockLaravelPort = mockLaravelServer.address().port;
  const mockLaravelUrl = `http://127.0.0.1:${mockLaravelPort}`;

  // Create test Socket.IO server connected to the mock auth server
  const testApp = createApp();
  const testHttpServer = http.createServer(testApp);
  const testIo = new SocketIOServer(testHttpServer, {
    cors: { origin: '*' },
  });

  initSockets(testIo, { laravelApiUrl: mockLaravelUrl });

  await new Promise((resolve) => testHttpServer.listen(0, resolve));
  const socketPort = testHttpServer.address().port;
  const socketUrl = `http://127.0.0.1:${socketPort}`;

  await t.test('rejects unauthenticated client (missing token)', async () => {
    const client = ClientIO(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    const err = await new Promise((resolve) => {
      client.on('connect_error', (error) => resolve(error));
    });

    assert.match(err.message, /Missing token/i);
    client.disconnect();
  });

  await t.test('rejects client with invalid token', async () => {
    const client = ClientIO(socketUrl, {
      auth: { token: 'invalid-expired-token' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    const err = await new Promise((resolve) => {
      client.on('connect_error', (error) => resolve(error));
    });

    assert.match(err.message, /Invalid or expired token/i);
    client.disconnect();
  });

  await t.test('authenticates client with valid Sanctum token and performs ping/pong', async () => {
    const client = ClientIO(socketUrl, {
      auth: { token: 'valid-test-sanctum-token' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });

    assert.equal(client.connected, true, 'Client should be connected');

    // Test realtime:ping -> realtime:pong
    const pongData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Pong timeout')), 3000);
      client.once('realtime:pong', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      client.emit('realtime:ping');
    });

    assert.ok(pongData, 'Should receive pong data');
    assert.ok(typeof pongData.timestamp === 'number', 'Pong should include numeric timestamp');

    // Test disconnect
    await new Promise((resolve) => {
      client.on('disconnect', (reason) => {
        assert.ok(reason);
        resolve();
      });
      client.disconnect();
    });

    assert.equal(client.connected, false, 'Client should be disconnected');
  });

  // Cleanup servers
  await new Promise((resolve) => testIo.close(resolve));
  await new Promise((resolve) => testHttpServer.close(resolve));
  await new Promise((resolve) => mockLaravelServer.close(resolve));
});
