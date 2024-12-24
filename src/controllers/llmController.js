// llmController.js
const { ModelManager } = require('../config/models');
const { providerManager } = require('../services/providerManager');
const { TokenTrackingService } = require('../services/tokenTrackingService');

const handleLLMRequest = async (req, res) => {
  try {
    const requestedModel = req.body.model;
    let selectedModel;
    let selectedProvider;

    if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
      const providers = providerManager.getProvidersInfo();
      const availableModels = providers.flatMap(provider => ({
        provider: provider.id,
        models: provider.models.filter(model => {
          const info = ModelManager.getModelInfo(model);
          return info?.tier === requestedModel;
        })
      })).filter(p => p.models.length > 0);

      if (availableModels.length === 0) {
        return res.status(400).json({
          error: {
            message: `No available models for tier: ${requestedModel}`,
            type: "invalid_request_error",
            code: "no_models_available"
          }
        });
      }

      const selected = availableModels[Math.floor(Math.random() * availableModels.length)];
      selectedModel = selected.models[0];
      selectedProvider = selected.provider;
    } else {
      if (!ModelManager.validateModel(requestedModel)) {
        return res.status(400).json({
          error: {
            message: "Invalid model specified",
            type: "invalid_request_error",
            code: "invalid_model"
          }
        });
      }
      selectedModel = requestedModel;
      const provider = providerManager.findAvailableProvider(selectedModel);
      if (!provider) {
        return res.status(400).json({
          error: {
            message: "No provider available for the requested model",
            type: "invalid_request_error",
            code: "no_provider_available"
          }
        });
      }
      selectedProvider = provider.id;
    }

    const modelInfo = ModelManager.getModelInfo(selectedModel);
    const requestData = {
      model: selectedModel,
      messages: req.body.messages,
      temperature: parseFloat(req.body.temperature) || 0.7,
      max_tokens: parseInt(req.body.max_tokens) || modelInfo.context,
      stream: false
    };

    const response = await providerManager.routeRequest(requestData);
    
    // Log token usage with provider information
    if (response.usage) {
      await TokenTrackingService.logUsage({
        consumerId: req.user._id,
        providerId: selectedProvider,
        model: selectedModel,
        usage: response.usage
      });
    }

    const formattedResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: selectedModel,
      model_tier: modelInfo.tier,
      provider_id: selectedProvider,
      system_fingerprint: `fp_${Math.random().toString(36).substr(2, 9)}`,
      choices: response.choices?.map(choice => ({
        index: choice.index || 0,
        message: {
          role: choice.message?.role || 'assistant',
          content: choice.message?.content || ''
        },
        finish_reason: choice.finish_reason || 'stop'
      })) || [],
      usage: response.usage
    };

    res.json(formattedResponse);

  } catch (error) {
    console.error('LLM Request Error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to process request',
        type: "server_error",
        code: "internal_error"
      }
    });
  }
};

module.exports = { handleLLMRequest };