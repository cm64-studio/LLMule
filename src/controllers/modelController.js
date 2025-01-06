// src/controllers/modelController.js
const { ModelManager } = require('../config/models');

const handleModelsList = async (req, res) => {
  try {
    const providerManager = req.app.locals.providerManager;
    const providersInfo = providerManager.getProvidersInfo();

    // Get unique models from all active providers with tier info
    const uniqueModels = new Map(); // Use Map to track unique models with their info
    const modelCounts = new Map(); // Track counts of each model

    providersInfo.forEach(provider => {
      if (provider.status === 'active') {
        provider.models.forEach(model => {
          // Update count for this model
          modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
          
          if (!uniqueModels.has(model)) {
            const modelInfo = ModelManager.getModelInfo(model);
            uniqueModels.set(model, {
              id: model,
              object: "model",
              created: Date.now(),
              owned_by: "llmule",
              root: model,
              parent: null,
              tier: modelInfo.tier, // Add tier info
              context_length: modelInfo.context || 4096,
              permission: [],
              provider_count: modelCounts.get(model) // Add count of providers using this model
            });
          } else {
            // Update the count for existing model
            const modelData = uniqueModels.get(model);
            modelData.provider_count = modelCounts.get(model);
            uniqueModels.set(model, modelData);
          }
        });
      }
    });

    // Convert to array and format response
    const models = Array.from(uniqueModels.values());

    // Return in the expected format with added tier info
    res.json({
      object: "list",
      data: models,
      record_count: models.length
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