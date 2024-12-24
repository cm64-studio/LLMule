// src/models/TokenBalance.js
const mongoose = require('mongoose');

const tokenBalanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provided: {
    tiny: { type: Number, default: 0 },
    small: { type: Number, default: 0 },
    medium: { type: Number, default: 0 }
  },
  consumed: {
    tiny: { type: Number, default: 0 },
    small: { type: Number, default: 0 },
    medium: { type: Number, default: 0 }
  },
  welcomeBalance: {
    type: Number,
    default: 1000000
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

tokenBalanceSchema.methods.getAvailableTokens = function(tier) {
  const provided = this.provided[tier] || 0;
  const consumed = this.consumed[tier] || 0;
  return (provided + this.welcomeBalance) - consumed;
};

const TokenBalance = mongoose.model('TokenBalance', tokenBalanceSchema);
module.exports = { TokenBalance };