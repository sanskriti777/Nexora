import mongoose from 'mongoose';

/**
 * Message Model Schema
 *
 * Primary message document for channels and direct/group conversations.
 * Supports threaded replies, editing history, and soft deletion.
 */
const messageSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: Number,
      required: [true, 'workspaceId is required'],
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null,
      index: true,
    },
    senderId: {
      type: Number,
      required: [true, 'senderId is required'],
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      minlength: [1, 'Message content cannot be empty'],
      maxlength: [10000, 'Message content cannot exceed 10000 characters'],
    },
    messageType: {
      type: String,
      enum: {
        values: ['text', 'system'],
        message: 'messageType must be either text or system',
      },
      default: 'text',
      required: true,
    },
    replyToMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      default: null,
      index: true,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Validation: A message must belong to either a conversation OR a channel, but never both
messageSchema.pre('validate', function () {
  const hasConversation = this.conversationId !== null && this.conversationId !== undefined;
  const hasChannel = this.channelId !== null && this.channelId !== undefined;

  if (hasConversation && hasChannel) {
    this.invalidate('conversationId', 'Message cannot belong to both a conversation and a channel');
    this.invalidate('channelId', 'Message cannot belong to both a conversation and a channel');
  }

  if (!hasConversation && !hasChannel) {
    this.invalidate('conversationId', 'Message must belong to either a conversation or a channel');
    this.invalidate('channelId', 'Message must belong to either a conversation or a channel');
  }
});

// Virtual helpers
messageSchema.virtual('isEdited').get(function () {
  return this.editedAt !== null && this.editedAt !== undefined;
});

messageSchema.virtual('isDeleted').get(function () {
  return this.deletedAt !== null && this.deletedAt !== undefined;
});

// Practical compound indexes for high-velocity chat retrieval & cursor pagination
messageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ workspaceId: 1, channelId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ threadId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ replyToMessageId: 1 });

export const Message = mongoose.model('Message', messageSchema);
export default Message;
