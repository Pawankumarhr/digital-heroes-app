const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    playedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    strokes: {
      type: Number,
      required: true,
      min: 1,
    },
    par: {
      type: Number,
      required: true,
      min: 1,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

scoreSchema.index({ user: 1, playedAt: -1 });

module.exports = mongoose.model('Score', scoreSchema);