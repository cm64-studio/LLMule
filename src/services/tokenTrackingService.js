// tokenTrackingService.js
const { TokenBalance } = require('../models/TokenBalance');
const { ModelManager } = require('../config/models');

class TokenTrackingService {
  static async logUsage({ 
    consumerId, // User requesting the completion
    providerId, // Provider serving the completion
    model, 
    usage 
  }) {
    try {
      const modelInfo = ModelManager.getModelInfo(model);
      const modelTier = modelInfo?.tier || 'tiny';

      // Create usage log entry first
      const usageLog = await UsageLog.create({
        consumerId,
        providerId,
        model,
        modelTier,
        tokensUsed: usage.total_tokens,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        isSelfService: consumerId.toString() === providerId.toString(),
        timestamp: new Date()
      });

      // If it's self-service (same user), just log without token transfer
      if (usageLog.isSelfService) {
        console.log(`Self-service usage logged: ${usageLog._id}`);
        return usageLog;
      }

      // Update consumer's balance (decrease)
      const consumerUpdate = await TokenBalance.findOneAndUpdate(
        { userId: consumerId },
        { 
          $inc: { 
            [`consumed.${modelTier}`]: usage.total_tokens 
          }
        },
        { new: true }
      );

      if (!consumerUpdate) {
        throw new Error(`No token balance found for consumer ${consumerId}`);
      }

      // Update provider's balance (increase)
      const providerUpdate = await TokenBalance.findOneAndUpdate(
        { userId: providerId },
        { 
          $inc: { 
            [`provided.${modelTier}`]: usage.total_tokens 
          }
        },
        { new: true }
      );

      if (!providerUpdate) {
        throw new Error(`No token balance found for provider ${providerId}`);
      }

      return usageLog;
    } catch (error) {
      console.error('Failed to log token usage:', error);
      throw error;
    }
  }

  static async getUserUsageStats(userId) {
    try {
      const asConsumer = await UsageLog.aggregate([
        { 
          $match: { 
            consumerId: userId,
            isSelfService: false
          }
        },
        {
          $group: {
            _id: '$modelTier',
            totalTokensUsed: { $sum: '$tokensUsed' },
            totalRequests: { $count: {} }
          }
        }
      ]);

      const asProvider = await UsageLog.aggregate([
        { 
          $match: { 
            providerId: userId,
            isSelfService: false
          }
        },
        {
          $group: {
            _id: '$modelTier',
            totalTokensProvided: { $sum: '$tokensUsed' },
            totalRequests: { $count: {} }
          }
        }
      ]);

      const selfService = await UsageLog.aggregate([
        { 
          $match: { 
            consumerId: userId,
            isSelfService: true
          }
        },
        {
          $group: {
            _id: '$modelTier',
            totalTokens: { $sum: '$tokensUsed' },
            totalRequests: { $count: {} }
          }
        }
      ]);

      return {
        consumption: asConsumer,
        provision: asProvider,
        selfService
      };
    } catch (error) {
      console.error('Failed to get usage stats:', error);
      throw error;
    }
  }
}

module.exports = { TokenTrackingService };