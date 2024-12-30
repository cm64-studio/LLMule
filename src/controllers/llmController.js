// controllers/llmController.js
// controllers/llmController.js
const { ModelManager } = require('../config/models');
const { providerManager } = require('../services/providerManager');
const TokenService = require('../services/tokenService');
const { TokenCalculator } = require('../config/tokenomics');
const RequestTimer = require('../utils/requestTimer');
const UsageLog = require('../models/usageLogModel');
const mongoose = require('mongoose');

// OpenAI API compatible error responses
const APIErrors = {
  NO_MODELS_AVAILABLE: {
    status: 400,
    error: {
      message: "No models available for the requested tier or model",
      type: "invalid_request_error",
      param: "model",
      code: "model_not_available"
    }
  },
  INSUFFICIENT_BALANCE: {
    status: 402,
    error: {
      message: "Insufficient balance to process request",
      type: "invalid_request_error",
      param: "tokens",
      code: "insufficient_balance"
    }
  },
  INVALID_MODEL: {
    status: 400,
    error: {
      message: "The requested model is not valid",
      type: "invalid_request_error",
      param: "model",
      code: "invalid_model"
    }
  }
};

const handleLLMRequest = async (req, res) => {
  const requestId = `req_${Date.now()}`;
  RequestTimer.startRequest(requestId);

  try {
    const { selectedModel, socketId, userId } = await selectModelAndProvider(req.body.model);
    const modelInfo = ModelManager.getModelInfo(selectedModel);
    
    const response = await processLLMRequest(
      selectedModel,
      socketId, // Use socketId for WebSocket communication
      req.body,
      modelInfo
    );

    const usage = calculateUsage(response, modelInfo);
    const timing = RequestTimer.endRequest(requestId, usage.total_tokens);

    await logUsage({
      consumerId: req.user._id,
      providerId: userId, // Use MongoDB ObjectId for logging
      model: selectedModel,
      modelInfo,
      usage,
      timing
    });

    const isSelfService = req.user._id.toString() === userId.toString();
    const muleAmount = TokenCalculator.tokensToMules(usage.total_tokens, modelInfo.tier);

    const formattedResponse = formatResponse({
      selectedModel,
      socketId,
      modelInfo,
      response,
      usage,
      timing,
      isSelfService,
      muleAmount
    });

    res.json(formattedResponse);

  } catch (error) {
    handleError(error, res);
  }
};

async function selectModelAndProvider(requestedModel) {
  const providers = providerManager.getProvidersInfo();
  
  if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
    const availableModels = providers
      .filter(p => p.status === 'active')
      .map(provider => {
        const matchingModels = provider.models.filter(model => {
          const info = ModelManager.getModelInfo(model);
          return info?.tier === requestedModel;
        });
        
        return {
          socketId: provider.id,  // This is the WebSocket ID
          userId: provider.userId, // This is the MongoDB ObjectId
          models: matchingModels
        };
      })
      .filter(p => p.models.length > 0);

    if (availableModels.length === 0) {
      const error = new Error('No models available');
      error.code = 'NO_MODELS_AVAILABLE';
      error.tier = requestedModel;
      throw error;
    }
    
    const selected = availableModels[Math.floor(Math.random() * availableModels.length)];
    return {
      selectedModel: selected.models[0],
      socketId: selected.socketId,
      userId: selected.userId // MongoDB ObjectId
    };
  }

  if (!ModelManager.validateModel(requestedModel)) {
    const error = new Error("Invalid model");
    error.code = "INVALID_MODEL";
    throw error;
  }

  const provider = providerManager.findAvailableProvider(requestedModel);
  if (!provider) {
    const error = new Error("No provider available");
    error.code = "NO_MODELS_AVAILABLE";
    error.model = requestedModel;
    throw error;
  }

  return {
    selectedModel: requestedModel,
    selectedProvider: provider.userId
  };
}

async function processLLMRequest(model, providerId, requestData, modelInfo) {
  try {
      const response = await providerManager.routeRequest({
          model,
          messages: requestData.messages,
          temperature: parseFloat(requestData.temperature) || 0.7,
          max_tokens: parseInt(requestData.max_tokens) || modelInfo.context,
          stream: false,
          providerId  // Pass the provider ID through
      });

      if (!response || !response.choices) {
          throw new Error("Invalid response from provider");
      }

      return response;
  } catch (error) {
      console.error('Error processing request:', error);
      throw error;
  }
}

function calculateUsage(response, modelInfo) {
  const usage = {
    prompt_tokens: response.usage?.prompt_tokens || 0,
    completion_tokens: response.usage?.completion_tokens || 0,
    total_tokens: response.usage?.total_tokens || 0
  };

  if (usage.total_tokens === 0) {
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  }

  return usage;
}

async function logUsage({ consumerId, providerId, model, modelInfo, usage, timing }) {
  console.log('Logging usage:', { 
      consumerId: consumerId.toString(),
      providerId: providerId,
      model,
      usage,
      timing,
      modelInfo 
  });
  
  // Ensure both IDs are MongoDB ObjectIds
  try {
      // Convert string IDs to ObjectIds if needed
      const consumerObjectId = typeof consumerId === 'string' ? 
          new mongoose.Types.ObjectId(consumerId) : consumerId;
          
      const providerObjectId = typeof providerId === 'string' ? 
          new mongoose.Types.ObjectId(providerId) : providerId;

      if (!providerObjectId) {
          console.error('Provider validation failed:', {
              providerId,
              type: typeof providerId
          });
          throw new Error('Invalid provider ID - registration required');
      }

      const validatedUsage = {
          prompt_tokens: Math.max(0, usage.prompt_tokens || 0),
          completion_tokens: Math.max(0, usage.completion_tokens || 0),
          total_tokens: Math.max(0, usage.total_tokens || 0)
      };

      const muleAmount = TokenCalculator.tokensToMules(validatedUsage.total_tokens, modelInfo.tier);

      // Check if this is a self-service request
      const isSelfService = consumerObjectId.toString() === providerObjectId.toString();

      // Create usage log with validated ObjectIds
      await UsageLog.create({
          consumerId: consumerObjectId,
          providerId: providerObjectId,
          model: typeof model === 'object' ? model.name : model,
          modelTier: modelInfo.tier,
          tokensUsed: validatedUsage.total_tokens,
          promptTokens: validatedUsage.prompt_tokens,
          completionTokens: validatedUsage.completion_tokens,
          duration_seconds: timing.duration_seconds,
          tokens_per_second: timing.tokens_per_second,
          isSelfService,
          muleAmount,
          timestamp: new Date()
      });

      console.log('Usage log created successfully:', {
          consumerId: consumerObjectId.toString(),
          providerId: providerObjectId.toString(),
          isSelfService
      });

      return { muleAmount, isSelfService };

  } catch (error) {
      console.error('Error logging usage:', error);
      if (error.message === 'Invalid provider ID - registration required') {
          throw error;
      }
      if (error.name === 'BSONTypeError' || error.name === 'CastError') {
          throw new Error('Invalid ID format provided');
      }
      throw error;
  }
}

function formatResponse({ 
  selectedModel, 
  selectedProvider, 
  modelInfo, 
  response, 
  usage, 
  timing,
  isSelfService,
  muleAmount
}) {
  return {
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
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      mule_amount: Number(muleAmount.toFixed(6)),
      duration_seconds: timing.duration_seconds,
      tokens_per_second: timing.tokens_per_second,
      transaction_mule_cost: isSelfService ? 0 : Number(muleAmount.toFixed(6))
    }
  };
}

function handleError(error, res) {
  console.error('LLM Request Error:', error);

  // Map error codes to API responses
  const errorResponses = {
    NO_MODELS_AVAILABLE: APIErrors.NO_MODELS_AVAILABLE,
    INSUFFICIENT_BALANCE: APIErrors.INSUFFICIENT_BALANCE,
    INVALID_MODEL: APIErrors.INVALID_MODEL
  };

  // Get the appropriate error response or use a generic one
  const apiError = errorResponses[error.code] || {
    status: 500,
    error: {
      message: error.message || 'An unexpected error occurred',
      type: "api_error",
      code: "internal_error"
    }
  };

  // Add request ID and timestamp for debugging
  const errorResponse = {
    error: {
      ...apiError.error,
      request_id: `req_${Date.now()}`,
      timestamp: new Date().toISOString()
    }
  };

  // Log detailed error for monitoring
  console.error('API Error Response:', {
    status: apiError.status,
    error: errorResponse.error,
    originalError: error
  });

  res.status(apiError.status).json(errorResponse);
}

module.exports = { handleLLMRequest };