import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';

import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { initSockets } from '../src/sockets/index.js';
import { Conversation } from '../src/models/Conversation.js';
import { Channel } from '../src/models/Channel.js';
import { Message } from '../src/models/Message.js';
import { Thread } from '../src/models/Thread.js';
import { Reaction } from '../src/models/Reaction.js';
import { clearWorkspaceCache } from '../src/utils/workspaceAuth.js';

const TEST_WS_A = 999901;
const TEST_WS_B = 999902;
const USER_ALICE = 1001;
const USER_BOB = 1002;
const USER_EVE = 1003; // In WS_B only

const TOKEN_ALICE = 'valid-token-alice';
const TOKEN_BOB = 'valid-token-bob';
const TOKEN_EVE = 'valid-token-eve';

async function cleanupTestData() {
  await Promise.all([
    Conversation.deleteMany({ workspaceId: { $in: [TEST_WS_A, TEST_WS_B] } }),
    Channel.deleteMany({ workspaceId: { $in: [TEST_WS_A, TEST_WS_B] } }),
    Message.deleteMany({ workspaceId: { $in: [TEST_WS_A, TEST_WS_B] } }),
    Thread.deleteMany({ workspaceId: { $in: [TEST_WS_A, TEST_WS_B] } }),
  ]);
  const orphanReactions = await Reaction.find({ userId: { $in: [USER_ALICE, USER_BOB, USER_EVE] } });
  if (orphanReactions.length > 0) {
    await Reaction.deleteMany({ _id: { $in: orphanReactions.map((r) => r._id) } });
  }
}

test('Chat API & Realtime Socket.IO Layer Tests', async (t) => {
  await connectDB();
  await cleanupTestData();
  clearWorkspaceCache();

  // 1. Mock Laravel Server
  const mockLaravelApp = express();
  mockLaravelApp.use(express.json());

  mockLaravelApp.get('/api/me', (req, res) => {
    const auth = req.headers['authorization'] || '';
    if (auth === `Bearer ${TOKEN_ALICE}`) {
      return res.json({ success: true, data: { user: { id: USER_ALICE, name: 'Alice', email: 'alice@nexora.test' } } });
    }
    if (auth === `Bearer ${TOKEN_BOB}`) {
      return res.json({ success: true, data: { user: { id: USER_BOB, name: 'Bob', email: 'bob@nexora.test' } } });
    }
    if (auth === `Bearer ${TOKEN_EVE}`) {
      return res.json({ success: true, data: { user: { id: USER_EVE, name: 'Eve', email: 'eve@nexora.test' } } });
    }
    return res.status(401).json({ message: 'Unauthenticated.' });
  });

  mockLaravelApp.get('/api/workspaces', (req, res) => {
    const auth = req.headers['authorization'] || '';
    if (auth === `Bearer ${TOKEN_ALICE}` || auth === `Bearer ${TOKEN_BOB}`) {
      return res.json({
        success: true,
        data: [{ id: TEST_WS_A, name: 'Test Workspace A' }],
      });
    }
    if (auth === `Bearer ${TOKEN_EVE}`) {
      return res.json({
        success: true,
        data: [{ id: TEST_WS_B, name: 'Test Workspace B' }],
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
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });
  app.set('io', io);
  initSockets(io, { laravelApiUrl: mockLaravelUrl });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const serverPort = httpServer.address().port;
  const apiBase = `http://127.0.0.1:${serverPort}`;

  let testChannelId = null;
  let testPrivateChannelId = null;
  let testConversationId = null;
  let testMessageId = null;

  t.after(async () => {
    await cleanupTestData();
    clearWorkspaceCache();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
    await new Promise((resolve) => mockLaravelServer.close(resolve));
    await disconnectDB();
  });

  // 1. Unauthenticated chat request
  await t.test('1. Unauthenticated chat request returns 401', async () => {
    const res = await fetch(`${apiBase}/api/chat/channels`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Missing token/i);
  });

  // 2. Workspace isolation
  await t.test('2. Cross-workspace access rejection returns 403', async () => {
    const res = await fetch(`${apiBase}/api/chat/channels`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_B), // Alice doesn't belong to WS_B
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Access denied/i);
  });

  // 3. Channel creation
  await t.test('3. Channel creation authorization & creation', async () => {
    const res = await fetch(`${apiBase}/api/chat/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'engineering',
        description: 'Engineering team discussions',
        isPrivate: false,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'engineering');
    testChannelId = body.data._id;

    // Create a private channel for Alice only
    const privRes = await fetch(`${apiBase}/api/chat/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'alice-private',
        isPrivate: true,
        memberIds: [USER_ALICE],
      }),
    });
    assert.equal(privRes.status, 201);
    const privBody = await privRes.json();
    testPrivateChannelId = privBody.data._id;
  });

  // 4. Channel listing
  await t.test('4. Channel listing filters private channels properly', async () => {
    // Alice sees both public and her private channel
    const aliceRes = await fetch(`${apiBase}/api/chat/channels`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    const aliceBody = await aliceRes.json();
    assert.equal(aliceBody.success, true);
    const aliceNames = aliceBody.data.map((c) => c.name);
    assert.ok(aliceNames.includes('engineering'));
    assert.ok(aliceNames.includes('alice-private'));

    // Bob only sees public channel, not Alice's private channel
    const bobRes = await fetch(`${apiBase}/api/chat/channels`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    const bobBody = await bobRes.json();
    const bobNames = bobBody.data.map((c) => c.name);
    assert.ok(bobNames.includes('engineering'));
    assert.equal(bobNames.includes('alice-private'), false);
  });

  // 5. Conversation creation & duplicate prevention
  await t.test('5. Conversation creation & direct duplicate prevention', async () => {
    const res1 = await fetch(`${apiBase}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'direct',
        participantIds: [USER_BOB],
      }),
    });

    assert.equal(res1.status, 201);
    const body1 = await res1.json();
    testConversationId = body1.data._id;
    assert.ok(testConversationId);

    // Calling again returns existing direct conversation
    const res2 = await fetch(`${apiBase}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'direct',
        participantIds: [USER_ALICE],
      }),
    });
    assert.equal(res2.status, 201);
    const body2 = await res2.json();
    assert.equal(body2.data._id, testConversationId);
  });

  // 6. Conversation listing
  await t.test('6. Conversation listing for participant', async () => {
    const res = await fetch(`${apiBase}/api/chat/conversations`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.length >= 1);
    assert.equal(body.data[0]._id, testConversationId);
  });

  // 7. Message creation in channel
  await t.test('7. Message creation in channel', async () => {
    const res = await fetch(`${apiBase}/api/chat/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: testChannelId,
        content: 'First engineering announcement',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.content, 'First engineering announcement');
    assert.equal(body.data.senderId, USER_ALICE);
    testMessageId = body.data._id;
  });

  // 8. Message listing & pagination
  await t.test('8. Message listing & cursor pagination', async () => {
    // Post additional messages
    for (let i = 1; i <= 3; i++) {
      await fetch(`${apiBase}/api/chat/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN_BOB}`,
          'X-Workspace-Id': String(TEST_WS_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: testChannelId,
          content: `Numbered channel message #${i}`,
        }),
      });
    }

    const res = await fetch(`${apiBase}/api/chat/channels/${testChannelId}/messages?limit=2`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.equal(body.pagination.hasMore, true);
    assert.ok(body.pagination.nextCursor);
  });

  // 9. Message editing authorization
  await t.test('9. Message editing authorization', async () => {
    // Bob cannot edit Alice's message
    const bobEditRes = await fetch(`${apiBase}/api/chat/messages/${testMessageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Tampered content' }),
    });
    assert.equal(bobEditRes.status, 403);

    // Alice can edit her own message
    const aliceEditRes = await fetch(`${apiBase}/api/chat/messages/${testMessageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Updated engineering announcement' }),
    });
    assert.equal(aliceEditRes.status, 200);
    const editBody = await aliceEditRes.json();
    assert.equal(editBody.data.content, 'Updated engineering announcement');
    assert.ok(editBody.data.editedAt);
  });

  // 10. Reactions CRUD
  await t.test('10. Reactions creation and removal', async () => {
    // Add reaction
    const addRes = await fetch(`${apiBase}/api/chat/messages/${testMessageId}/reactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emoji: '🚀' }),
    });
    assert.equal(addRes.status, 200);
    const addBody = await addRes.json();
    assert.equal(addBody.data.emoji, '🚀');
    assert.equal(addBody.data.userId, USER_BOB);

    // Delete reaction
    const delRes = await fetch(`${apiBase}/api/chat/messages/${testMessageId}/reactions?emoji=🚀`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    assert.equal(delRes.status, 200);
  });

  // 11. Threads CRUD
  await t.test('11. Thread creation and reply', async () => {
    // Reply to root message
    const replyRes = await fetch(`${apiBase}/api/chat/threads/${testMessageId}/replies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN_BOB}`,
        'X-Workspace-Id': String(TEST_WS_A),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Threaded question regarding the announcement' }),
    });
    assert.equal(replyRes.status, 201);
    const replyBody = await replyRes.json();
    assert.equal(replyBody.data.replyToMessageId, testMessageId);
    assert.ok(replyBody.data.threadId);

    // Get thread messages
    const threadRes = await fetch(`${apiBase}/api/chat/threads/${testMessageId}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    assert.equal(threadRes.status, 200);
    const threadBody = await threadRes.json();
    assert.equal(threadBody.data.rootMessage._id, testMessageId);
    assert.equal(threadBody.data.replies.length, 1);
  });

  // 12. Message soft deletion
  await t.test('12. Message soft deletion authorization', async () => {
    const delRes = await fetch(`${apiBase}/api/chat/messages/${testMessageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${TOKEN_ALICE}`,
        'X-Workspace-Id': String(TEST_WS_A),
      },
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.ok(delBody.data.deletedAt);
  });

  // 13. Socket.IO Events and Room Broadcasts
  await t.test('13. Socket.IO chat events & room authorization', async () => {
    const clientAlice = ClientIO(apiBase, {
      auth: { token: TOKEN_ALICE },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    const clientBob = ClientIO(apiBase, {
      auth: { token: TOKEN_BOB },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    await Promise.all([
      new Promise((res) => clientAlice.on('connect', res)),
      new Promise((res) => clientBob.on('connect', res)),
    ]);

    // Unauthorized room join (Bob tries to join Alice's private channel)
    const joinDenied = await new Promise((res) => {
      clientBob.emit('chat:join:channel', { channelId: testPrivateChannelId }, res);
    });
    assert.equal(joinDenied.success, false);
    assert.match(joinDenied.message, /denied/i);

    // Authorized room joins
    await new Promise((res) => clientAlice.emit('chat:join:channel', { channelId: testChannelId }, res));
    await new Promise((res) => clientBob.emit('chat:join:channel', { channelId: testChannelId }, res));

    // Message broadcast test: Alice sends message, Bob receives chat:message:new
    const msgReceivedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for chat:message:new')), 4000);
      clientBob.on('chat:message:new', (msg) => {
        if (msg.content === 'Realtime socket test message') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });

    const sendAck = await new Promise((res) => {
      clientAlice.emit(
        'chat:message:send',
        {
          workspaceId: TEST_WS_A,
          channelId: testChannelId,
          content: 'Realtime socket test message',
        },
        res
      );
    });
    assert.equal(sendAck.success, true);
    assert.ok(sendAck.data._id);

    const receivedMsg = await msgReceivedPromise;
    assert.equal(receivedMsg.content, 'Realtime socket test message');
    assert.equal(receivedMsg.senderId, USER_ALICE);

    clientAlice.disconnect();
    clientBob.disconnect();
  });
});
