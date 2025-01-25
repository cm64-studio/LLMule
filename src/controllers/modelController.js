// src/controllers/modelController.js
const { ModelManager } = require('../config/models');
const TokenService = require('../services/tokenService');

// Function to generate a deterministic number from MongoDB ID
function generateProviderNumber(userId) {
  // Convert the first 4 bytes of MongoDB ObjectId to a number
  // MongoDB ObjectId's first 4 bytes represent timestamp, which ensures
  // older users get lower numbers
  const idHex = userId.toString().substring(0, 8);
  const number = parseInt(idHex, 16) % 1000000; // Keep it to 6 digits max
  return `user_${number}`;
}

const handleModelsList = async (req, res) => {
  try {
    const providerManager = req.app.locals.providerManager;
    const providersInfo = providerManager.getProvidersInfo();
    const modelMap = new Map(); // Use a map to deduplicate models

    // Create a map of provider aliases
    const providerAliases = new Map();
    providersInfo.forEach(provider => {
      if (provider.userId) {
        providerAliases.set(
          provider.userId.toString(),
          generateProviderNumber(provider.userId)
        );
      }
    });

    // Get performance stats for each provider
    const providerStats = await Promise.all(
      providersInfo
        .filter(provider => provider.status === 'active')
        .map(async provider => {
          const stats = await TokenService.getProviderStats(provider.userId, '24h');
          return {
            providerId: provider.id,
            userId: provider.userId,
            alias: providerAliases.get(provider.userId?.toString()) || 'anonymous',
            stats: stats || {
              totalRequests: 0,
              totalTokens: 0,
              totalEarned: 0,
              avgTokensPerSecond: 0,
              maxTokensPerSecond: 0,
              avgDurationSeconds: 0,
              failedRequests: 0,
              successRate: 100 // Default to 100% for new providers
            },
            models: provider.models,
            lastHeartbeat: provider.lastHeartbeat
          };
        })
    );

    // Process each provider's models
    for (const provider of providerStats) {
      const { stats, models, alias, lastHeartbeat } = provider;
      
      for (const model of models) {
        const modelInfo = ModelManager.getModelInfo(model);
        
        // Calculate time since last heartbeat
        const lastActive = new Date(lastHeartbeat);
        const timeSinceActive = Math.floor((Date.now() - lastActive.getTime()) / 1000);
        const isOnline = timeSinceActive < 300; // Consider offline after 5 minutes

        // Create a unique model ID that includes provider info
        const baseModelId = `${model}@${alias}`;
        
        // Check if this model+provider combination already exists
        let instanceCount = 0;
        let modelId = baseModelId;
        while (modelMap.has(modelId)) {
          instanceCount++;
          modelId = `${baseModelId}#${instanceCount}`;
        }

        // Get performance stats from provider stats
        const performance = {
          success_rate: Number(stats.successRate || 100),
          total_requests: stats.totalRequests || 0,
          avg_tokens_per_second: Math.round(stats.avgTokensPerSecond || 0),
          max_tokens_per_second: Math.round(stats.maxTokensPerSecond || 0),
          avg_duration_seconds: Math.round(stats.avgDurationSeconds || 0)
        };

        const modelInstance = {
          id: modelId,
          object: "model",
          created: Date.now(),
          owned_by: "llmule",
          root: model,
          parent: null,
          tier: modelInfo.tier,
          context_length: modelInfo.context || 4096,
          permission: [],
          provider: {
            user_id: alias,
            ...performance,
            last_active_seconds_ago: timeSinceActive,
            status: isOnline ? 'online' : 'offline'
          }
        };

        // If this is an additional instance, add instance info
        if (instanceCount > 0) {
          modelInstance.instance = {
            number: instanceCount + 1,
            total: instanceCount + 1
          };
        }

        modelMap.set(modelId, modelInstance);
      }
    }

    // Convert map to array
    let modelList = Array.from(modelMap.values());

    // Sort models by performance metrics (avg tokens/sec) within their tier
    modelList.sort((a, b) => {
      if (a.tier !== b.tier) {
        return ['xl', 'large', 'medium', 'small'].indexOf(a.tier) - 
               ['xl', 'large', 'medium', 'small'].indexOf(b.tier);
      }
      return (b.provider.avg_tokens_per_second || 0) - (a.provider.avg_tokens_per_second || 0);
    });

    res.json({
      object: "list",
      data: modelList,
      record_count: modelList.length
    });

  } catch (error) {
    console.error('Error getting models list:', error);
    res.status(500).json({
      error: 'Failed to get models list',
      message: error.message
    });
  }
};

module.exports = {
  handleModelsList
};