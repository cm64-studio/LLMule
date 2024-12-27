// models/usageLogModel.js
const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  consumerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  model: {
    type: String,
    required: true
  },
  modelTier: {
    type: String,
    enum: ['small', 'medium', 'large', 'xl'],
    required: true
  },
  tokensUsed: {
    type: Number,
    required: true
  },
  promptTokens: {
    type: Number,
    required: true
  },
  completionTokens: {
    type: Number,
    required: true
  },
  duration_seconds: {
    type: Number,
    required: true
  },
  tokens_per_second: {
    type: Number,
    required: true
  },
  isSelfService: {
    type: Boolean,
    required: true,
    index: true
  },
  muleAmount: {
    type: Number,
    required: true,
    get: v => Number(v.toFixed(6)), // Ensures 6 decimal places
    set: v => Number(v.toFixed(6))
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const UsageLog = mongoose.model('UsageLog', usageLogSchema);

module.exports = UsageLog;