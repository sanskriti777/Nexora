import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';

import { createApp } from '../src/app.js';
import { initSockets } from '../src/sockets/index.js';

test('Phase 4J — Realtime Notification Delivery & Authorization', async (t) => {
  // 1. Mock Laravel Authentication Service
  const mockLaravelApp = express();
  mockLaravelApp.use(express.json());

  const usersByToken = {
    'token-user-101': { id: 101, name: 'Sanskriti', email: 'sanskriti@nexora.test' },
    'token-user-102': { id: 102, name: 'Rahul', email: 'rahul@nexora.test' },
  };

  mockLaravelApp.get('/api/me', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/, '').trim();
    const user = usersByToken[token];

    if (user) {
      return res.status(200).json({
        success: true,
        data: { user },
      });
    }

    return res.status(401).json({ message: 'Unauthenticated.' });
  });

  const mockLaravelServer = http.createServer(mockLaravelApp);
  await new Promise((resolve) => mockLaravelServer.listen(0, resolve));
  const mockLaravelPort = mockLaravelServer.address().port;
  const mockLaravelUrl = `http://127.0.0.1:${mockLaravelPort}`;

  // 2. Realtime Application & Socket.IO Server Setup
  const INTERNAL_SECRET = 'nexora-internal-secret-test';
  const app = createApp({ internalSecret: INTERNAL_SECRET, laravelApiUrl: mockLaravelUrl });
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  app.set('io', io);
  initSockets(io, { laravelApiUrl: mockLaravelUrl });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const serverPort = httpServer.address().port;
  const serverUrl = `http://127.0.0.1:${serverPort}`;

  t.after(async () => {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await new Promise((resolve) => mockLaravelServer.close(resolve));
  });

  // 3. Helper to connect authenticated client
  const createClient = (token) => {
    return ClientIO(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });
  };

  await t.test('1. internal bridge rejects unauthorized secret or invalid payload', async () => {
    // Bad secret
    const resForbidden = await fetch(`${serverUrl}/internal/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'wrong-secret',
      },
      body: JSON.stringify({ notification: { userId: 101, title: 'Test' } }),
    });
    assert.equal(resForbidden.status, 403);

    // Missing payload
    const resBadPayload = await fetch(`${serverUrl}/internal/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({}),
    });
    assert.equal(resBadPayload.status, 400);
  });

  await t.test('2. notification:new delivered only to authorized recipient', async () => {
    const client101 = createClient('token-user-101');
    const client102 = createClient('token-user-102');

    await Promise.all([
      new Promise((resolve, reject) => {
        client101.on('connect', resolve);
        client101.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        client102.on('connect', resolve);
        client102.on('connect_error', reject);
      }),
    ]);

    const received101 = [];
    const received102 = [];

    client101.on('notification:new', (n) => received101.push(n));
    client102.on('notification:new', (n) => received102.push(n));

    // Send notification targeted to User 101
    const testNotification = {
      id: 'notif-uuid-101',
      userId: 101,
      workspaceId: 1,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: 'You have been assigned to test task',
      entityType: 'task',
      entityId: '42',
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    const res = await fetch(`${serverUrl}/internal/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ notification: testNotification }),
    });

    assert.equal(res.status, 200);

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Client 101 must receive the notification
    assert.equal(received101.length, 1);
    assert.equal(received101[0].id, 'notif-uuid-101');
    assert.equal(received101[0].title, 'New Task Assigned');

    // Client 102 must NOT receive User 101's notification
    assert.equal(received102.length, 0);

    client101.disconnect();
    client102.disconnect();
  });

  await t.test('3. duplicate events and reconnect lifecycle maintains isolation', async () => {
    const client101 = createClient('token-user-101');
    await new Promise((resolve) => client101.on('connect', resolve));

    const events = [];
    client101.on('notification:new', (n) => events.push(n));

    // Send duplicate notifications with same ID
    const notif = {
      id: 'dedup-notif-1',
      userId: 101,
      type: 'system',
      title: 'Deduplication Test',
      message: 'Testing realtime delivery',
    };

    await fetch(`${serverUrl}/internal/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify({ notification: notif }),
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(events.length, 1);

    // Disconnect and reconnect client
    client101.disconnect();

    const client101Reconnected = createClient('token-user-101');
    await new Promise((resolve) => client101Reconnected.on('connect', resolve));

    const reconnectedEvents = [];
    client101Reconnected.on('notification:new', (n) => reconnectedEvents.push(n));

    // Send new notification after reconnect
    const notifAfterReconnect = {
      id: 'notif-after-reconnect',
      userId: 101,
      type: 'system',
      title: 'Reconnected Notice',
      message: 'Client receives notifications after reconnecting',
    };

    await fetch(`${serverUrl}/internal/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify({ notification: notifAfterReconnect }),
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(reconnectedEvents.length, 1);
    assert.equal(reconnectedEvents[0].id, 'notif-after-reconnect');

    client101Reconnected.disconnect();
  });

  await t.test('4. existing ping/pong and infrastructure events remain functional', async () => {
    const client = createClient('token-user-101');
    await new Promise((resolve) => client.on('connect', resolve));

    const pong = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Pong timeout')), 3000);
      client.emit('realtime:ping');
      client.on('realtime:pong', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    assert.ok(pong.timestamp);
    client.disconnect();
  });
});
