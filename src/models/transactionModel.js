// models/transactionModel.js
const mongoose = require('mongoose');
const { tokenConfig } = require('../config/tokenomics');

const transactionSchema = new mongoose.Schema({
  // Core transaction info
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  transactionType: {
    type: String,
    enum: ['consumption', 'provision', 'self_service', 'deposit', 'withdrawal', 'consumption_anonymous'],
    required: true,
    index: true
  },
  consumerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Model info
  model: {
    type: String,
    required: true
  },
  modelType: {
    type: String,
    enum: Object.keys(tokenConfig.model_types),
    required: true
  },
  modelTier: {
    type: String,
    enum: Object.keys(tokenConfig.conversion_rates),
    required: true
  },

  // Financial info
  muleAmount: {
    type: Number,
    required: true,
    get: v => Number(v.toFixed(6)),
    set: v => Number(v.toFixed(6))
  },
  platformFee: {
    type: Number,
    required: true
  },

  // Usage metrics
  usage: {
    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,
    duration_seconds: Number,
    tokens_per_second: Number
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Useful indexes
transactionSchema.index({ 'consumerId': 1, 'timestamp': -1 });
transactionSchema.index({ 'providerId': 1, 'timestamp': -1 });
transactionSchema.index({ 'modelTier': 1, 'timestamp': -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;