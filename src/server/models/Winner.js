const mongoose = require('mongoose');

const winnerSchema = new mongoose.Schema(
  {
    draw: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Draw',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    charity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Charity',
      default: null,
    },
    payoutAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
      index: true,
    },
    payoutStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

winnerSchema.index({ draw: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Winner', winnerSchema);