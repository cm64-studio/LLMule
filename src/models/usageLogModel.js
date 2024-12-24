// usageLogModel.js
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
    enum: ['tiny', 'small', 'medium'],
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
  isSelfService: {
    type: Boolean,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const UsageLog = mongoose.model('UsageLog', usageLogSchema);

module.exports = { TokenTrackingService, UsageLog };