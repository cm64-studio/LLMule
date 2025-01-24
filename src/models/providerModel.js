// src/models/providerModel.js
const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  performance: {
    history: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      tokens_per_second: Number,
      duration_seconds: Number,
      success: Boolean
    }],
    total_requests: {
      type: Number,
      default: 0
    },
    successful_requests: {
      type: Number,
      default: 0
    },
    failed_requests: {
      type: Number,
      default: 0
    },
    total_tokens: {
      type: Number,
      default: 0
    }
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for efficient querying
providerSchema.index({ 'lastSeen': -1 });
providerSchema.index({ 'performance.total_requests': -1 });
providerSchema.index({ 'performance.successful_requests': -1 });

const Provider = mongoose.model('Provider', providerSchema);
module.exports = { Provider };