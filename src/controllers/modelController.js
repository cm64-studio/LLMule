// src/controllers/modelController.js
const { authenticateApiKey } = require('../middleware/auth');

const handleModelsList = async (req, res) => {
  try {
    const providerManager = req.app.locals.providerManager;
    const providersInfo = providerManager.getProvidersInfo();

    // Get unique models from all active providers
    const uniqueModels = new Set();
    providersInfo.forEach(provider => {
      if (provider.status === 'active') {
        provider.models.forEach(model => uniqueModels.add(model));
      }
    });

    // Convert to array and format for Mistral Studio compatibility
    const models = Array.from(uniqueModels).map(modelName => ({
      id: modelName,
      object: "model",
      created: Date.now(),
      owned_by: "llmule",
      root: modelName,
      parent: null,
      permission: []
    }));

    // Return in the expected format
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