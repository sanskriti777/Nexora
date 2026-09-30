import mongoose from 'mongoose';

/**
 * Conversation Model Schema
 *
 * Represents direct (1-on-1) or group conversations.
 * References MySQL workspace and user IDs at the application level.
 */
const conversationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: Number,
      required: [true, 'workspaceId is required'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['direct', 'group'],
        message: 'Type must be either direct or group',
      },
      default: 'direct',
      required: true,
    },
    participantIds: {
      type: [Number],
      required: [true, 'participantIds is required'],
      validate: [
        {
          validator: function (participants) {
            return Array.isArray(participants) && participants.length >= 2;
          },
          message: 'A conversation must have at least 2 participants',
        },
        {
          validator: function (participants) {
            const uniqueParticipants = new Set(participants);
            return uniqueParticipants.size === participants.length;
          },
          message: 'Participants in a conversation must be unique',
        },
      ],
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

// Index for participant lookup within a workspace
conversationSchema.index({ workspaceId: 1, participantIds: 1 });
conversationSchema.index({ workspaceId: 1, type: 1, participantIds: 1 });
conversationSchema.index({ participantIds: 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
