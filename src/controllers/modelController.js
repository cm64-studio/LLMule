// src/controllers/modelController.js
const { ModelManager } = require('../config/models');

const handleModelsList = async (req, res) => {
  try {
    const providerManager = req.app.locals.providerManager;
    const providersInfo = providerManager.getProvidersInfo();

    // Get unique models from all active providers with tier info
    const uniqueModels = new Map(); // Use Map to track unique models with their info

    providersInfo.forEach(provider => {
      if (provider.status === 'active') {
        provider.models.forEach(model => {
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
              permission: []
            });
          }
        });
      }
    });

    // Convert to array and format response
    const models = Array.from(uniqueModels.values());

    // Return in the expected format with added tier info
    res.json({
      object: "list",
      data: models
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