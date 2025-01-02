// models/transactionModel.js
const mongoose = require('mongoose');
const { tokenConfig } = require('../config/tokenomics');

const transactionSchema = new mongoose.Schema({
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
    rawAmount: {
        type: Number,
        required: true,
        min: 0
    },
    muleAmount: {
        type: Number,
        required: true,
        get: v => Number(v.toFixed(6)),
        set: v => Number(v.toFixed(6))
    },
    platformFee: {
        type: Number,
        required: true,
        min: 0
    },
    usage: {
        promptTokens: {
            type: Number,
            required: true,
            min: 0
        },
        completionTokens: {
            type: Number,
            required: true,
            min: 0
        },
        totalTokens: {
            type: Number,
            required: true,
            min: 0
        },
        duration_seconds: {
            type: Number,
            required: true,
            min: 0
        },
        tokens_per_second: {
            type: Number,
            required: true,
            min: 0
        }
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

// Add indexes for efficient querying
transactionSchema.index({ 'consumerId': 1, 'timestamp': -1 });
transactionSchema.index({ 'providerId': 1, 'timestamp': -1 });
transactionSchema.index({ 'modelTier': 1, 'timestamp': -1 });
transactionSchema.index({ 'usage.totalTokens': 1 });
transactionSchema.index({ 'usage.tokens_per_second': 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;