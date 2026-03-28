const mongoose = require('mongoose');

const charitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    websiteUrl: {
      type: String,
      default: '',
      trim: true,
    },
    mediaUrls: {
      type: [String],
      default: [],
    },
    totalRaised: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Charity', charitySchema);