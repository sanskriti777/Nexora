import mongoose from 'mongoose';

/**
 * Channel Model Schema
 *
 * Represents workspace channels (public or private), optionally bound to a team.
 * References MySQL workspace, team, and user IDs at the application level.
 */
const channelSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: Number,
      required: [true, 'workspaceId is required'],
      index: true,
    },
    teamId: {
      type: Number,
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Channel name is required'],
      trim: true,
      lowercase: true,
      minlength: [1, 'Channel name must be at least 1 character'],
      maxlength: [80, 'Channel name cannot exceed 80 characters'],
      validate: {
        validator: function (val) {
          // Normalize names: letters, numbers, hyphens, underscores
          return /^[a-z0-9-_]+$/.test(val);
        },
        message: 'Channel name can only contain lowercase letters, numbers, hyphens, and underscores',
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    createdBy: {
      type: Number,
      required: [true, 'createdBy user ID is required'],
      index: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true,
    },
    memberIds: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Enforce uniqueness of channel name within a workspace and team scope
channelSchema.index({ workspaceId: 1, teamId: 1, name: 1 }, { unique: true });
channelSchema.index({ workspaceId: 1, isPrivate: 1 });
channelSchema.index({ memberIds: 1 });

export const Channel = mongoose.model('Channel', channelSchema);
export default Channel;
