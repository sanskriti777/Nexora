import mongoose from 'mongoose';

/**
 * Reaction Model Schema
 *
 * Represents an emoji reaction attached to a chat message by an authenticated user.
 * References MySQL user ID at the application level.
 */
const reactionSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: [true, 'messageId is required'],
      index: true,
    },
    userId: {
      type: Number,
      required: [true, 'userId is required'],
    },
    emoji: {
      type: String,
      required: [true, 'Emoji is required'],
      trim: true,
      minlength: [1, 'Emoji cannot be empty'],
      maxlength: [32, 'Emoji string cannot exceed 32 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent duplicate identical reaction from the same user on the same message
reactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });
reactionSchema.index({ userId: 1 });

export const Reaction = mongoose.model('Reaction', reactionSchema);
export default Reaction;
