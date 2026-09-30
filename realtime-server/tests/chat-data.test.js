import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectDB, disconnectDB } from '../src/config/database.js';
import { Conversation } from '../src/models/Conversation.js';
import { Channel } from '../src/models/Channel.js';
import { Message } from '../src/models/Message.js';
import { Thread } from '../src/models/Thread.js';
import { Reaction } from '../src/models/Reaction.js';
import { chatService } from '../src/services/chatService.js';
import { conversationRepository } from '../src/repositories/conversationRepository.js';
import { channelRepository } from '../src/repositories/channelRepository.js';
import { messageRepository } from '../src/repositories/messageRepository.js';
import { threadRepository } from '../src/repositories/threadRepository.js';
import { reactionRepository } from '../src/repositories/reactionRepository.js';

const TEST_WORKSPACE_ID = 999901;
const USER_ALICE = 1001;
const USER_BOB = 1002;
const USER_CHARLIE = 1003;

async function cleanupTestData() {
  await Promise.all([
    Conversation.deleteMany({ workspaceId: TEST_WORKSPACE_ID }),
    Channel.deleteMany({ workspaceId: TEST_WORKSPACE_ID }),
    Message.deleteMany({ workspaceId: TEST_WORKSPACE_ID }),
    Thread.deleteMany({ workspaceId: TEST_WORKSPACE_ID }),
  ]);
  // Also delete reactions whose parent messages were deleted
  const orphanReactions = await Reaction.find({ userId: { $in: [USER_ALICE, USER_BOB, USER_CHARLIE] } });
  if (orphanReactions.length > 0) {
    await Reaction.deleteMany({ _id: { $in: orphanReactions.map((r) => r._id) } });
  }
}

test('Chat Data Layer — MongoDB Models, Repositories & Services', async (t) => {
  // Connect to DB and ensure clean initial state
  await connectDB();
  await cleanupTestData();

  let testDirectConv = null;
  let testChannel = null;
  let testMessageInConv = null;
  let testMessageInChan = null;

  t.after(async () => {
    await cleanupTestData();
    await disconnectDB();
  });

  // 1. Conversation creation
  await t.test('1. Conversation creation (direct and group)', async () => {
    // Direct conversation
    testDirectConv = await chatService.createConversation(
      {
        workspaceId: TEST_WORKSPACE_ID,
        type: 'direct',
        participantIds: [USER_ALICE, USER_BOB],
      },
      USER_ALICE
    );

    assert.ok(testDirectConv._id, 'Direct conversation should have an _id');
    assert.equal(testDirectConv.workspaceId, TEST_WORKSPACE_ID);
    assert.equal(testDirectConv.type, 'direct');
    assert.equal(testDirectConv.participantIds.length, 2);
    assert.ok(testDirectConv.participantIds.includes(USER_ALICE));
    assert.ok(testDirectConv.participantIds.includes(USER_BOB));

    // Group conversation
    const groupConv = await chatService.createConversation(
      {
        workspaceId: TEST_WORKSPACE_ID,
        type: 'group',
        participantIds: [USER_ALICE, USER_BOB, USER_CHARLIE],
      },
      USER_ALICE
    );

    assert.ok(groupConv._id);
    assert.equal(groupConv.type, 'group');
    assert.equal(groupConv.participantIds.length, 3);
  });

  // 2. Conversation retrieval
  await t.test('2. Conversation retrieval by ID and by user/workspace', async () => {
    const foundById = await conversationRepository.findById(testDirectConv._id);
    assert.ok(foundById);
    assert.equal(foundById._id.toString(), testDirectConv._id.toString());

    const userConvs = await conversationRepository.findByUserAndWorkspace(
      TEST_WORKSPACE_ID,
      USER_BOB
    );
    assert.ok(Array.isArray(userConvs));
    assert.ok(userConvs.length >= 2, 'Bob should participate in at least direct and group');
  });

  // 3. Duplicate direct conversation handling
  await t.test('3. Duplicate direct conversation handling', async () => {
    // Attempting to create direct conversation between Alice and Bob again should return existing
    const duplicateAttempt = await chatService.createConversation(
      {
        workspaceId: TEST_WORKSPACE_ID,
        type: 'direct',
        participantIds: [USER_BOB, USER_ALICE],
      },
      USER_BOB
    );

    assert.equal(
      duplicateAttempt._id.toString(),
      testDirectConv._id.toString(),
      'Should return the existing direct conversation rather than duplicating'
    );

    const count = await Conversation.countDocuments({
      workspaceId: TEST_WORKSPACE_ID,
      type: 'direct',
      participantIds: { $all: [USER_ALICE, USER_BOB], $size: 2 },
    });
    assert.equal(count, 1, 'Only one direct conversation should exist between the two users');
  });

  // 4. Channel creation
  await t.test('4. Channel creation with name normalization', async () => {
    testChannel = await chatService.createChannel(
      {
        workspaceId: TEST_WORKSPACE_ID,
        name: 'General-Chat',
        description: 'Workspace general chat',
        isPrivate: false,
        memberIds: [USER_ALICE, USER_BOB],
      },
      USER_ALICE
    );

    assert.ok(testChannel._id);
    assert.equal(testChannel.name, 'general-chat', 'Channel name should be normalized to lowercase');
    assert.equal(testChannel.workspaceId, TEST_WORKSPACE_ID);
    assert.equal(testChannel.isPrivate, false);
    assert.ok(testChannel.memberIds.includes(USER_ALICE));
  });

  // 5. Channel uniqueness
  await t.test('5. Channel uniqueness within workspace scope', async () => {
    await assert.rejects(
      async () => {
        await chatService.createChannel(
          {
            workspaceId: TEST_WORKSPACE_ID,
            name: 'general-chat',
          },
          USER_BOB
        );
      },
      /already exists/i,
      'Should reject duplicate channel name in same workspace'
    );
  });

  // 6. Message creation in conversation
  await t.test('6. Message creation in conversation', async () => {
    testMessageInConv = await chatService.createMessage(
      {
        workspaceId: TEST_WORKSPACE_ID,
        conversationId: testDirectConv._id.toString(),
        content: 'Hello Bob! This is Alice.',
      },
      USER_ALICE
    );

    assert.ok(testMessageInConv._id);
    assert.equal(testMessageInConv.content, 'Hello Bob! This is Alice.');
    assert.equal(testMessageInConv.senderId, USER_ALICE);
    assert.equal(testMessageInConv.conversationId.toString(), testDirectConv._id.toString());
    assert.equal(testMessageInConv.channelId, null);
    assert.equal(testMessageInConv.messageType, 'text');
    assert.equal(testMessageInConv.isDeleted, false);
    assert.equal(testMessageInConv.isEdited, false);
  });

  // 7. Message creation in channel
  await t.test('7. Message creation in channel', async () => {
    testMessageInChan = await chatService.createMessage(
      {
        workspaceId: TEST_WORKSPACE_ID,
        channelId: testChannel._id.toString(),
        content: 'Welcome everyone to general-chat!',
      },
      USER_BOB
    );

    assert.ok(testMessageInChan._id);
    assert.equal(testMessageInChan.channelId.toString(), testChannel._id.toString());
    assert.equal(testMessageInChan.conversationId, null);
    assert.equal(testMessageInChan.senderId, USER_BOB);
  });

  // 8. Invalid message ownership rejected
  await t.test('8. Invalid message ownership rejected (neither or both)', async () => {
    // Neither conversationId nor channelId
    await assert.rejects(
      async () => {
        await chatService.createMessage(
          {
            workspaceId: TEST_WORKSPACE_ID,
            content: 'Invalid orphan message',
          },
          USER_ALICE
        );
      },
      /either a conversation or a channel/i
    );

    // Both conversationId and channelId
    await assert.rejects(
      async () => {
        await chatService.createMessage(
          {
            workspaceId: TEST_WORKSPACE_ID,
            conversationId: testDirectConv._id.toString(),
            channelId: testChannel._id.toString(),
            content: 'Invalid dual-destination message',
          },
          USER_ALICE
        );
      },
      /not both/i
    );
  });

  // 9. Message pagination (cursor-based)
  await t.test('9. Message pagination with stable cursor', async () => {
    // Create 5 chronological test messages in the channel
    const createdIds = [];
    for (let i = 1; i <= 5; i++) {
      const msg = await chatService.createMessage(
        {
          workspaceId: TEST_WORKSPACE_ID,
          channelId: testChannel._id.toString(),
          content: `Numbered channel message #${i}`,
        },
        USER_ALICE
      );
      createdIds.push(msg._id.toString());
    }

    // Page 1: fetch latest 3 messages
    const page1 = await chatService.getMessages({
      workspaceId: TEST_WORKSPACE_ID,
      channelId: testChannel._id.toString(),
      limit: 3,
    });

    assert.equal(page1.messages.length, 3, 'Page 1 should have 3 messages');
    assert.equal(page1.pagination.hasMore, true, 'Page 1 should indicate hasMore = true');
    assert.ok(page1.pagination.nextCursor, 'Page 1 should provide nextCursor');

    // Page 2: fetch next messages before cursor
    const page2 = await chatService.getMessages({
      workspaceId: TEST_WORKSPACE_ID,
      channelId: testChannel._id.toString(),
      beforeCursor: page1.pagination.nextCursor,
      limit: 3,
    });

    assert.ok(page2.messages.length > 0, 'Page 2 should return older messages');
    // Ensure no overlapping message IDs between page 1 and page 2
    const page1Ids = new Set(page1.messages.map((m) => m._id.toString()));
    for (const msg of page2.messages) {
      assert.equal(page1Ids.has(msg._id.toString()), false, 'Page 2 must not overlap with Page 1');
    }
  });

  // 10. Message editing
  await t.test('10. Message editing and authorization', async () => {
    // Unauthorized attempt (Bob trying to edit Alice's message)
    await assert.rejects(
      async () => {
        await chatService.editMessage(
          testMessageInConv._id.toString(),
          'Hacked message content',
          USER_BOB
        );
      },
      /Unauthorized/i
    );

    // Authorized edit by sender (Alice)
    const edited = await chatService.editMessage(
      testMessageInConv._id.toString(),
      'Hello Bob! This is Alice (edited).',
      USER_ALICE
    );

    assert.equal(edited.content, 'Hello Bob! This is Alice (edited).');
    assert.ok(edited.editedAt, 'editedAt timestamp should be populated');
    assert.equal(edited.isEdited, true);
  });

  // 11. Message soft deletion
  await t.test('11. Message soft deletion preserves historical record', async () => {
    // Unauthorized delete
    await assert.rejects(
      async () => {
        await chatService.softDeleteMessage(testMessageInConv._id.toString(), USER_BOB, false);
      },
      /Unauthorized/i
    );

    // Authorized delete by sender
    const deleted = await chatService.softDeleteMessage(
      testMessageInConv._id.toString(),
      USER_ALICE,
      false
    );

    assert.ok(deleted.deletedAt, 'deletedAt timestamp should be set');
    assert.equal(deleted.isDeleted, true);

    // Verify record still exists in database (not physically purged)
    const rawRecord = await Message.findById(testMessageInConv._id);
    assert.ok(rawRecord, 'Record must remain in storage after soft-delete');
    assert.ok(rawRecord.deletedAt);

    // Editing deleted message should be rejected
    await assert.rejects(
      async () => {
        await chatService.editMessage(testMessageInConv._id.toString(), 'Try to edit', USER_ALICE);
      },
      /Cannot edit a deleted message/i
    );
  });

  // 12. Thread creation
  await t.test('12. Thread creation for root message', async () => {
    const thread = await chatService.createThread(testMessageInChan._id.toString(), USER_ALICE);

    assert.ok(thread._id);
    assert.equal(thread.rootMessageId.toString(), testMessageInChan._id.toString());
    assert.equal(thread.workspaceId, TEST_WORKSPACE_ID);
    assert.equal(thread.createdBy, USER_ALICE);

    // Idempotent: creating thread again returns the existing thread
    const sameThread = await chatService.createThread(testMessageInChan._id.toString(), USER_BOB);
    assert.equal(sameThread._id.toString(), thread._id.toString());
  });

  // 13. Reaction creation
  await t.test('13. Reaction creation and retrieval', async () => {
    const reaction = await chatService.addReaction(testMessageInChan._id.toString(), '👍', USER_ALICE);

    assert.ok(reaction._id);
    assert.equal(reaction.emoji, '👍');
    assert.equal(reaction.userId, USER_ALICE);
    assert.equal(reaction.messageId.toString(), testMessageInChan._id.toString());

    const allReactions = await chatService.getReactions(testMessageInChan._id.toString());
    assert.equal(allReactions.length, 1);
    assert.equal(allReactions[0].emoji, '👍');
  });

  // 14. Duplicate reaction prevention
  await t.test('14. Duplicate reaction prevention (idempotent)', async () => {
    // Add identical reaction again by same user
    const dupReaction = await chatService.addReaction(
      testMessageInChan._id.toString(),
      '👍',
      USER_ALICE
    );

    // Should return existing without creating a duplicate record
    const allReactions = await chatService.getReactions(testMessageInChan._id.toString());
    assert.equal(allReactions.length, 1, 'Only one reaction should exist for Alice with thumbs up');

    // Remove reaction
    const removed = await chatService.removeReaction(
      testMessageInChan._id.toString(),
      '👍',
      USER_ALICE
    );
    assert.equal(removed, true);

    const afterRemoval = await chatService.getReactions(testMessageInChan._id.toString());
    assert.equal(afterRemoval.length, 0);
  });

  // 15. MongoDB validation failures
  await t.test('15. MongoDB validation failures', async () => {
    // Conversation with invalid type
    await assert.rejects(
      async () => {
        const invalidConv = new Conversation({
          workspaceId: TEST_WORKSPACE_ID,
          type: 'invalid-type',
          participantIds: [USER_ALICE, USER_BOB],
          createdBy: USER_ALICE,
        });
        await invalidConv.save();
      },
      /Type must be either direct or group/i
    );

    // Channel with invalid characters in name
    await assert.rejects(
      async () => {
        await chatService.createChannel(
          {
            workspaceId: TEST_WORKSPACE_ID,
            name: 'Invalid Channel Name with spaces & symbols!',
          },
          USER_ALICE
        );
      },
      /Channel name can only contain/i
    );

    // Message with empty content
    await assert.rejects(
      async () => {
        await chatService.createMessage(
          {
            workspaceId: TEST_WORKSPACE_ID,
            channelId: testChannel._id.toString(),
            content: '   ',
          },
          USER_ALICE
        );
      },
      /Message content is required/i
    );
  });

  // 16. Required fields
  await t.test('16. Required fields validation', async () => {
    // Message missing senderId
    await assert.rejects(
      async () => {
        const msg = new Message({
          workspaceId: TEST_WORKSPACE_ID,
          channelId: testChannel._id,
          content: 'Test content',
        });
        await msg.save();
      },
      /senderId is required/i
    );

    // Channel missing workspaceId
    await assert.rejects(
      async () => {
        const chan = new Channel({
          name: 'chan-no-workspace',
          createdBy: USER_ALICE,
        });
        await chan.save();
      },
      /workspaceId is required/i
    );
  });

  // 17. Appropriate indexes and unique constraints
  await t.test('17. Schema index definitions and uniqueness behavior', async () => {
    // Verify indexes are registered on models
    const channelIndexes = Channel.schema.indexes();
    assert.ok(channelIndexes.length > 0, 'Channel should have schema indexes');
    const hasUniqueChannelName = channelIndexes.some(
      ([idx, opts]) => idx.workspaceId === 1 && idx.name === 1 && opts?.unique === true
    );
    assert.ok(hasUniqueChannelName, 'Channel should have unique compound index on workspaceId + teamId + name');

    const reactionIndexes = Reaction.schema.indexes();
    const hasUniqueReaction = reactionIndexes.some(
      ([idx, opts]) => idx.messageId === 1 && idx.userId === 1 && idx.emoji === 1 && opts?.unique === true
    );
    assert.ok(hasUniqueReaction, 'Reaction should have unique compound index on messageId + userId + emoji');

    const messageIndexes = Message.schema.indexes();
    assert.ok(messageIndexes.length >= 4, 'Message should have compound indexes for fast channel/conversation lookups');
  });
});
