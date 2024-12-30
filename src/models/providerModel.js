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
      timestamp: Date,
      tokens_per_second: Number,
      duration_seconds: Number
    }],
    total_requests: {
      type: Number,
      default: 0
    },
    total_tokens: {
      type: Number,
      default: 0
    }
  },
  lastSeen: Date
});

const Provider = mongoose.model('Provider', providerSchema);
module.exports = Provider;