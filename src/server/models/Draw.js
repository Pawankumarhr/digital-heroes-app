const mongoose = require('mongoose');

const drawSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['random', 'algorithm'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'simulated', 'published', 'closed'],
      default: 'draft',
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    rules: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

drawSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Draw', drawSchema);