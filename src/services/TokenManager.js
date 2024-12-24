// src/services/TokenManager.js
const TokenBalance = require('../models/TokenBalance');

class TokenManager {
  static TIERS = {
    TINY: 'tiny',
    SMALL: 'small',
    MEDIUM: 'medium'
  };

  static getModelTier(modelName) {
    const tierMap = {
      'tinyllama': this.TIERS.TINY,
      'mistral': this.TIERS.SMALL,
      'phi-4': this.TIERS.MEDIUM
    };
    
    for (const [key, tier] of Object.entries(tierMap)) {
      if (modelName.toLowerCase().includes(key)) {
        return tier;
      }
    }
    return this.TIERS.TINY;
  }

  static async initializeBalance(userId) {
    return await TokenBalance.create({ userId });
  }

  static async updateProviderTokens(userId, modelName, tokensProvided) {
    const tier = this.getModelTier(modelName);
    const update = { $inc: {} };
    update.$inc[`provided.${tier}`] = tokensProvided;
    
    return await TokenBalance.findOneAndUpdate(
      { userId },
      update,
      { upsert: true, new: true }
    );
  }

  static async updateConsumerTokens(userId, modelName, tokensConsumed) {
    const tier = this.getModelTier(modelName);
    const update = { $inc: {} };
    update.$inc[`consumed.${tier}`] = tokensConsumed;
    
    return await TokenBalance.findOneAndUpdate(
      { userId },
      update,
      { new: true }
    );
  }

  static async checkAllowance(userId, modelName, requestedTokens) {
    const tier = this.getModelTier(modelName);
    const balance = await TokenBalance.findOne({ userId });
    
    if (!balance) {
      return { allowed: false, remaining: 0 };
    }

    const available = balance.getAvailableTokens(tier);
    return {
      allowed: available >= requestedTokens,
      remaining: available
    };
  }

  static async getRemainingTokens(userId, modelName) {
    const balance = await TokenBalance.findOne({ userId });
    if (!balance) return 0;
    
    const tier = this.getModelTier(modelName);
    return balance.getAvailableTokens(tier);
  }
}

module.exports = { TokenManager, TokenBalance };