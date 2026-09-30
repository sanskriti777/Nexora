import mongoose from 'mongoose';

/**
 * Thread Model Schema
 *
 * Represents message reply threads rooted in a specific parent message.
 * References MySQL workspace and user IDs at the application level.
 */
const threadSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: Number,
      required: [true, 'workspaceId is required'],
      index: true,
    },
    rootMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'rootMessageId is required'],
      unique: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
      index: true,
    },
    createdBy: {
      type: Number,
      required: [true, 'createdBy user ID is required'],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Validation: Thread must belong to either a channel or a conversation
threadSchema.pre('validate', function () {
  const hasConversation = this.conversationId !== null && this.conversationId !== undefined;
  const hasChannel = this.channelId !== null && this.channelId !== undefined;

  if (hasConversation && hasChannel) {
    this.invalidate('conversationId', 'Thread cannot belong to both a conversation and a channel');
    this.invalidate('channelId', 'Thread cannot belong to both a conversation and a channel');
  }

  if (!hasConversation && !hasChannel) {
    this.invalidate('conversationId', 'Thread must belong to either a conversation or a channel');
    this.invalidate('channelId', 'Thread must belong to either a conversation or a channel');
  }
});

// Indexes for fast lookup
threadSchema.index({ workspaceId: 1, channelId: 1 });
threadSchema.index({ workspaceId: 1, conversationId: 1 });

export const Thread = mongoose.model('Thread', threadSchema);
export default Thread;
