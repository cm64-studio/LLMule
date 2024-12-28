// models/balanceModels.js
const mongoose = require('mongoose');
const { tokenConfig } = require('../config/tokenomics');

// Main balance in MULE tokens
const balanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: tokenConfig.MULE.welcome_amount,
    get: v => Number(v.toFixed(tokenConfig.MULE.decimals))
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Detailed transaction log
const transactionSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  transactionType: {
    type: String,
    enum: ['consumption', 'provision', 'self_service', 'deposit', 'withdrawal', 'consumption_anonymous'],
    required: true
  },
  consumerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  providerId: {
    type: String,
    index: true
  },
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
  // Raw usage amount (tokens/images/seconds)
  rawAmount: {
    type: Number,
    required: true
  },
  // Amount in MULE tokens
  muleAmount: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true
  },
  // For future reference/auditing
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Index for efficient querying
transactionSchema.index({ consumerId: 1, timestamp: -1 });
transactionSchema.index({ providerId: 1, timestamp: -1 });
transactionSchema.index({ modelTier: 1, timestamp: -1 });

const Balance = mongoose.model('Balance', balanceSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = { Balance, Transaction };