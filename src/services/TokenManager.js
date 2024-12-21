// src/services/tokenManager.js
const { TokenBalance } = require('../models/mongodb-models');

class TokenManager {
  static getModelTier(modelName) {
    // Map model names to tiers
    const tierMap = {
      'tinyllama': 'tiny',
      'mistral:latest': 'small',
      'phi-4:latest': 'medium'
    };
    return tierMap[modelName.toLowerCase()] || 'tiny';
  }

  static async updateTokenBalance(userId, modelName, tokensProvided = 0, tokensConsumed = 0) {
    const modelTier = this.getModelTier(modelName);
    
    try {
      const balance = await TokenBalance.findOneAndUpdate(
        { userId, modelTier },
        {
          $inc: {
            tokensProvided: tokensProvided,
            tokensConsumed: tokensConsumed
          },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, new: true }
      );
      
      return balance;
    } catch (error) {
      console.error('Error updating token balance:', error);
      throw error;
    }
  }

  static async getBalance(userId, modelTier) {
    try {
      const balance = await TokenBalance.findOne({ userId, modelTier });
      return balance || { tokensProvided: 0, tokensConsumed: 0 };
    } catch (error) {
      console.error('Error getting token balance:', error);
      throw error;
    }
  }

  static async checkAllowance(userId, modelName, requestedTokens) {
    const modelTier = this.getModelTier(modelName);
    const balance = await this.getBalance(userId, modelTier);
    
    // Basic allowance logic - can be enhanced
    const netBalance = balance.tokensProvided - balance.tokensConsumed;
    return {
      allowed: netBalance >= requestedTokens,
      remaining: netBalance
    };
  }
}

module.exports = TokenManager;