import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';

import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { initSockets } from '../src/sockets/index.js';
import { presenceManager } from '../src/services/presenceService.js';
import { clearWorkspaceCache } from '../src/utils/workspaceAuth.js';
import { Channel } from '../src/models/Channel.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';

const TEST_WS_1 = 888801;
const TEST_WS_2 = 888802;
const USER_1 = 2001; // Sanskriti
const USER_2 = 2002; // Rahul
const USER_UNAUTH = 2003; // In WS_2 only

const TOKEN_1 = 'valid-token-sanskriti';
const TOKEN_2 = 'valid-token-rahul';
const TOKEN_UNAUTH = 'valid-token-unauth';

test('Phase 4I-D — Realtime Presence, Typing, Connection & Room Lifecycle', async (t) => {
  await connectDB();
  presenceManager.clear();
  clearWorkspaceCache();

  await Promise.all([
    Channel.deleteMany({ workspaceId: { $in: [TEST_WS_1, TEST_WS_2] } }),
    Conversation.deleteMany({ workspaceId: { $in: [TEST_WS_1, TEST_WS_2] } }),
    Message.deleteMany({ workspaceId: { $in: [TEST_WS_1, TEST_WS_2] } }),
  ]);

  // Create a test channel for room-scoped typing tests
  const testChannel = await Channel.create({
    workspaceId: TEST_WS_1,
    name: 'general-testing',
    isPrivate: false,
    createdBy: USER_1,
  });

  // 1. Mock Laravel Server
  const mockLaravelApp = express();
  mockLaravelApp.use(express.json());

  mockLaravelApp.get('/api/me', (req, res) => {
    const auth = req.headers['authorization'] || '';
    if (auth === `Bearer ${TOKEN_1}`) {
      return res.json({ success: true, data: { user: { id: USER_1, name: 'Sanskriti', email: 'sanskriti@nexora.test' } } });
    }
    if (auth === `Bearer ${TOKEN_2}`) {
      return res.json({ success: true, data: { user: { id: USER_2, name: 'Rahul', email: 'rahul@nexora.test' } } });
    }
    if (auth === `Bearer ${TOKEN_UNAUTH}`) {
      return res.json({ success: true, data: { user: { id: USER_UNAUTH, name: 'Unauth', email: 'unauth@nexora.test' } } });
    }
    return res.status(401).json({ message: 'Unauthenticated.' });
  });

  mockLaravelApp.get('/api/workspaces', (req, res) => {
    const auth = req.headers['authorization'] || '';
    if (auth === `Bearer ${TOKEN_1}` || auth === `Bearer ${TOKEN_2}`) {
      return res.json({
        success: true,
        data: [{ id: TEST_WS_1, name: 'Main Workspace' }],
      });
    }
    if (auth === `Bearer ${TOKEN_UNAUTH}`) {
      return res.json({
        success: true,
        data: [{ id: TEST_WS_2, name: 'Other Workspace' }],
      });
    }
    return res.status(401).json({ message: 'Unauthenticated.' });
  });

  const mockLaravelServer = http.createServer(mockLaravelApp);
  await new Promise((resolve) => mockLaravelServer.listen(0, resolve));
  const mockLaravelPort = mockLaravelServer.address().port;
  const mockLaravelUrl = `http://127.0.0.1:${mockLaravelPort}`;

  // 2. Realtime Express App & Socket Server
  const app = createApp({ laravelApiUrl: mockLaravelUrl });
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  app.set('io', io);
  initSockets(io, { laravelApiUrl: mockLaravelUrl });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const serverPort = httpServer.address().port;
  const socketUrl = `http://127.0.0.1:${serverPort}`;

  // Helper to create authenticated client
  const createClient = (token) => {
    return ClientIO(socketUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      autoConnect: true,
    });
  };

  // ----------------------------------------------------
  // Test 1: Authenticated user becomes online
  // ----------------------------------------------------
  await t.test('1. authenticated user becomes online', async () => {
    const client1 = createClient(TOKEN_1);
    await new Promise((resolve) => client1.on('connect', resolve));

    assert.equal(presenceManager.isUserOnline(USER_1), true);
    client1.disconnect();
  });

  // ----------------------------------------------------
  // Test 2: User becomes offline after final socket disconnect
  // ----------------------------------------------------
  await t.test('2. user becomes offline after final socket disconnect', async () => {
    const client1 = createClient(TOKEN_1);
    await new Promise((resolve) => client1.on('connect', resolve));
    assert.equal(presenceManager.isUserOnline(USER_1), true);

    client1.disconnect();
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(presenceManager.isUserOnline(USER_1), false);
    assert.ok(presenceManager.getLastSeen(USER_1) > 0);
  });

  // ----------------------------------------------------
  // Test 3: User remains online with multiple sockets
  // ----------------------------------------------------
  await t.test('3. user remains online with multiple sockets', async () => {
    const tab1 = createClient(TOKEN_1);
    const tab2 = createClient(TOKEN_1);

    await Promise.all([
      new Promise((resolve) => tab1.on('connect', resolve)),
      new Promise((resolve) => tab2.on('connect', resolve)),
    ]);

    assert.equal(presenceManager.isUserOnline(USER_1), true);

    // Disconnect tab 1
    tab1.disconnect();
    await new Promise((r) => setTimeout(r, 60));

    // Must still be online because tab 2 is active
    assert.equal(presenceManager.isUserOnline(USER_1), true);

    // Disconnect tab 2
    tab2.disconnect();
    await new Promise((r) => setTimeout(r, 60));

    // Now user is offline
    assert.equal(presenceManager.isUserOnline(USER_1), false);
  });

  // ----------------------------------------------------
  // Test 4: Presence event scoped to authorized workspace
  // ----------------------------------------------------
  await t.test('4. presence event scoped to authorized workspace', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    // Bob subscribes to workspace presence
    await new Promise((resolve) => {
      clientBob.emit('presence:subscribe', { workspaceId: TEST_WS_1 }, (res) => {
        assert.equal(res.success, true);
        resolve();
      });
    });

    // Listen for Alice's presence update on Bob's socket
    const presencePromise = new Promise((resolve) => {
      clientBob.on('presence:update', (payload) => {
        if (payload.userId === USER_1) {
          resolve(payload);
        }
      });
    });

    // Alice joins the workspace
    clientAlice.emit('chat:join:workspace', { workspaceId: TEST_WS_1 });

    const update = await presencePromise;
    assert.equal(update.userId, USER_1);
    assert.equal(update.status, 'online');

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 5: Unauthorized workspace presence rejected
  // ----------------------------------------------------
  await t.test('5. unauthorized workspace presence rejected', async () => {
    const clientUnauth = createClient(TOKEN_UNAUTH);
    await new Promise((resolve) => clientUnauth.on('connect', resolve));

    // Attempt to subscribe to TEST_WS_1 (which this user doesn't belong to)
    const response = await new Promise((resolve) => {
      clientUnauth.emit('presence:subscribe', { workspaceId: TEST_WS_1 }, resolve);
    });

    assert.equal(response.success, false);
    assert.match(response.message, /unauthorized/i);

    clientUnauth.disconnect();
  });

  // ----------------------------------------------------
  // Test 6: typing:start broadcast
  // ----------------------------------------------------
  await t.test('6. typing:start broadcast', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    // Both join test channel
    await Promise.all([
      new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
      new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
    ]);

    const typingPromise = new Promise((resolve) => {
      clientBob.on('chat:typing:update', (payload) => {
        resolve(payload);
      });
    });

    clientAlice.emit('chat:typing:start', { channelId: testChannel._id.toString() });

    const typingEvent = await typingPromise;
    assert.equal(typingEvent.userId, USER_1);
    assert.equal(typingEvent.isTyping, true);
    assert.equal(typingEvent.channelId, testChannel._id.toString());

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 7: typing:stop broadcast
  // ----------------------------------------------------
  await t.test('7. typing:stop broadcast', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    await Promise.all([
      new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
      new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
    ]);

    const typingStopPromise = new Promise((resolve) => {
      clientBob.on('chat:typing:update', (payload) => {
        if (payload.isTyping === false) {
          resolve(payload);
        }
      });
    });

    clientAlice.emit('chat:typing:stop', { channelId: testChannel._id.toString() });

    const typingEvent = await typingStopPromise;
    assert.equal(typingEvent.userId, USER_1);
    assert.equal(typingEvent.isTyping, false);

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 8: Client user ID cannot spoof typing identity
  // ----------------------------------------------------
  await t.test('8. client user ID cannot spoof typing identity', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    await Promise.all([
      new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
      new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
    ]);

    const spoofAttemptPromise = new Promise((resolve) => {
      clientBob.on('chat:typing:update', (payload) => {
        resolve(payload);
      });
    });

    // Client Alice maliciously supplies userId: 99999
    clientAlice.emit('chat:typing:start', {
      channelId: testChannel._id.toString(),
      userId: 99999,
    });

    const result = await spoofAttemptPromise;
    // Server must strictly report authoritative USER_1 (Alice)
    assert.equal(result.userId, USER_1);
    assert.notEqual(result.userId, 99999);

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 9: Typing events scoped to active conversation/channel
  // ----------------------------------------------------
  await t.test('9. typing events scoped to active conversation/channel', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    // Alice joins testChannel, but Bob does NOT join
    await new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r));

    let receivedUnintendedEvent = false;
    clientBob.on('chat:typing:update', () => {
      receivedUnintendedEvent = true;
    });

    clientAlice.emit('chat:typing:start', { channelId: testChannel._id.toString() });
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(receivedUnintendedEvent, false, 'Bob should not receive typing event for a room he is not in');

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 10: Duplicate room join does not duplicate events
  // ----------------------------------------------------
  await t.test('10. duplicate room join does not duplicate events', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    // Bob joins channel twice
    await new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r));
    await new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r));

    await new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r));

    let messageCount = 0;
    clientBob.on('chat:message:new', () => {
      messageCount++;
    });

    await new Promise((resolve) => {
      clientAlice.emit('chat:message:send', {
        workspaceId: TEST_WS_1,
        channelId: testChannel._id.toString(),
        content: 'Testing duplicate join protection',
      }, resolve);
    });

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(messageCount, 1, 'Bob should receive exactly 1 message event despite double join');

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // ----------------------------------------------------
  // Test 11: Disconnect cleanup removes presence state
  // ----------------------------------------------------
  await t.test('11. disconnect cleanup removes presence state', async () => {
    const client = createClient(TOKEN_1);
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => client.emit('presence:subscribe', { workspaceId: TEST_WS_1 }, resolve));

    assert.equal(presenceManager.isUserOnline(USER_1), true);
    assert.ok(presenceManager.getOnlineUsersInWorkspace(TEST_WS_1).includes(USER_1));

    client.disconnect();
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(presenceManager.isUserOnline(USER_1), false);
    assert.equal(presenceManager.getOnlineUsersInWorkspace(TEST_WS_1).includes(USER_1), false);
  });

  // ----------------------------------------------------
  // Test 12: Reconnect restores appropriate state
  // ----------------------------------------------------
  await t.test('12. reconnect restores appropriate state', async () => {
    const client = createClient(TOKEN_1);
    await new Promise((resolve) => client.on('connect', resolve));
    assert.equal(presenceManager.isUserOnline(USER_1), true);

    // Simulate transport disconnect & reconnect
    client.disconnect();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(presenceManager.isUserOnline(USER_1), false);

    client.connect();
    await new Promise((resolve) => client.on('connect', resolve));
    assert.equal(presenceManager.isUserOnline(USER_1), true);

    client.disconnect();
  });

  // ----------------------------------------------------
  // Test 13: Existing ping/pong still works
  // ----------------------------------------------------
  await t.test('13. existing ping/pong still works', async () => {
    const client = createClient(TOKEN_1);
    await new Promise((resolve) => client.on('connect', resolve));

    const pong = await new Promise((resolve) => {
      client.on('realtime:pong', resolve);
      client.emit('realtime:ping');
    });

    assert.ok(pong.timestamp > 0);
    client.disconnect();
  });

  // ----------------------------------------------------
  // Test 14: Existing chat message events still work
  // ----------------------------------------------------
  await t.test('14. existing chat message events still work', async () => {
    const clientAlice = createClient(TOKEN_1);
    const clientBob = createClient(TOKEN_2);

    await Promise.all([
      new Promise((resolve) => clientAlice.on('connect', resolve)),
      new Promise((resolve) => clientBob.on('connect', resolve)),
    ]);

    await Promise.all([
      new Promise((r) => clientAlice.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
      new Promise((r) => clientBob.emit('chat:join:channel', { channelId: testChannel._id.toString() }, r)),
    ]);

    const msgPromise = new Promise((resolve) => {
      clientBob.on('chat:message:new', resolve);
    });

    clientAlice.emit('chat:message:send', {
      workspaceId: TEST_WS_1,
      channelId: testChannel._id.toString(),
      content: 'Hello Bob from Alice!',
    });

    const msg = await msgPromise;
    assert.equal(msg.content, 'Hello Bob from Alice!');
    assert.equal(msg.senderId, USER_1);

    clientAlice.disconnect();
    clientBob.disconnect();
  });

  // Cleanup
  await Promise.all([
    new Promise((resolve) => httpServer.close(resolve)),
    new Promise((resolve) => mockLaravelServer.close(resolve)),
    disconnectDB(),
  ]);
});
