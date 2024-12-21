// src/models/TokenBalance.js
const tokenBalanceSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    tier: {
      type: String,
      enum: modelTierEnum,
      required: true
    },
    tokensProvided: {
      type: Number,
      default: 0
    },
    tokensConsumed: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  });
  
  tokenBalanceSchema.index({ userId: 1, tier: 1 });
  
  const TokenBalance = mongoose.model('TokenBalance', tokenBalanceSchema);

  module.exports = {
    TokenBalance,
    modelTierEnum
  };