// src/controllers/modelController.js
const { ModelManager } = require('../config/models');
const TokenService = require('../services/tokenService');

const handleModelsList = async (req, res) => {
  try {
    const providerManager = req.app.locals.providerManager;
    const providersInfo = providerManager.getProvidersInfo();
    const modelInstances = [];

    // Get performance stats for each provider
    const providerStats = await Promise.all(
      providersInfo
        .filter(provider => provider.status === 'active')
        .map(async provider => {
          const stats = await TokenService.getProviderStats(provider.userId, '24h');
          return {
            providerId: provider.id,
            userId: provider.userId,
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
      const { stats, models, userId, lastHeartbeat } = provider;
      
      for (const model of models) {
        const modelInfo = ModelManager.getModelInfo(model);
        
        // Calculate time since last heartbeat
        const lastActive = new Date(lastHeartbeat);
        const timeSinceActive = Math.floor((Date.now() - lastActive.getTime()) / 1000);
        const isOnline = timeSinceActive < 300; // Consider offline after 5 minutes

        // Format user ID consistently
        const shortUserId = userId ? `user_${userId.toString().substring(0, 6)}` : 'anonymous';
        
        // Create a unique model ID that includes provider info using the same format as user_id
        const llmuleId = `${model}@${shortUserId}`;

        // Get performance stats from provider stats
        const performance = {
          success_rate: Number(stats.successRate || 100),
          total_requests: stats.totalRequests || 0,
          avg_tokens_per_second: Math.round(stats.avgTokensPerSecond || 0),
          max_tokens_per_second: Math.round(stats.maxTokensPerSecond || 0),
          avg_duration_seconds: Math.round(stats.avgDurationSeconds || 0)
        };

        modelInstances.push({
          id: llmuleId, // Unique identifier using consistent user ID format
          object: "model",
          created: Date.now(),
          owned_by: "llmule",
          root: model, // The base model name
          parent: null,
          tier: modelInfo.tier,
          context_length: modelInfo.context || 4096,
          permission: [],
          provider: {
            user_id: shortUserId,
            ...performance,
            last_active_seconds_ago: timeSinceActive,
            status: isOnline ? 'online' : 'offline'
          }
        });
      }
    }

    // Sort models by performance metrics (avg tokens/sec) within their tier
    modelInstances.sort((a, b) => {
      if (a.tier !== b.tier) {
        return ['xl', 'large', 'medium', 'small'].indexOf(a.tier) - 
               ['xl', 'large', 'medium', 'small'].indexOf(b.tier);
      }
      return (b.provider.avg_tokens_per_second || 0) - (a.provider.avg_tokens_per_second || 0);
    });

    res.json({
      object: "list",
      data: modelInstances,
      record_count: modelInstances.length
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