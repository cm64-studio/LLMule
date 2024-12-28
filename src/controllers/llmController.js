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
    const { selectedModel, selectedProvider } = await selectModelAndProvider(req.body.model);
    const modelInfo = ModelManager.getModelInfo(selectedModel);
    
    const response = await processLLMRequest(
      selectedModel,
      selectedProvider,
      req.body,
      modelInfo
    );

    const usage = calculateUsage(response, modelInfo);
    const timing = RequestTimer.endRequest(requestId, usage.total_tokens);

    await logUsage({
      consumerId: req.user._id,
      providerId: selectedProvider,
      model: selectedModel,
      modelInfo,
      usage,
      timing
    });

    const isSelfService = req.user._id.toString() === selectedProvider.toString();
    const muleAmount = TokenCalculator.tokensToMules(usage.total_tokens, modelInfo.tier);

    const formattedResponse = formatResponse({
      selectedModel,
      selectedProvider,
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
  console.log('Finding provider for model:', requestedModel);

  if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
    const providers = providerManager.getProvidersInfo();
    const availableModels = providers
      .filter(p => p.status === 'active')
      .map(provider => ({
        provider: provider.id,
        models: provider.models.filter(model => {
          // Normalize model info
          const modelName = typeof model === 'object' ? model.name : model;
          const info = ModelManager.getModelInfo(modelName);
          console.log('Provider model check:', {
            model: modelName,
            tier: info?.tier,
            requestedTier: requestedModel
          });
          return info?.tier === requestedModel;
        })
      }))
      .filter(p => p.models.length > 0);
      
    if (availableModels.length === 0) {
      // Enhanced error object
      const error = new Error("No models available");
      error.code = "NO_MODELS_AVAILABLE";
      error.tier = requestedModel;
      throw error;
    }
    
    const selected = availableModels[Math.floor(Math.random() * availableModels.length)];
    return {
      selectedModel: selected.models[0],
      selectedProvider: selected.provider
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

async function processLLMRequest(model, provider, requestData, modelInfo) {
  const response = await providerManager.routeRequest({
    model,
    messages: requestData.messages,
    temperature: parseFloat(requestData.temperature) || 0.7,
    max_tokens: parseInt(requestData.max_tokens) || modelInfo.context,
    stream: false
  });

  if (!response || !response.choices) {
    throw new Error("Invalid response from provider");
  }

  return response;
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
    providerId,
    model,
    usage,
    timing,
    modelInfo 
  });
  
  // Ensure we have valid token counts
  const validatedUsage = {
    prompt_tokens: Math.max(0, usage.prompt_tokens || 0),
    completion_tokens: Math.max(0, usage.completion_tokens || 0),
    total_tokens: Math.max(0, usage.total_tokens || 0)
  };

  // If total_tokens is 0, calculate from components
  if (validatedUsage.total_tokens === 0) {
    validatedUsage.total_tokens = validatedUsage.prompt_tokens + validatedUsage.completion_tokens;
  }

  // Get model name from object if needed
  const modelName = typeof model === 'object' ? model.name : model;
  const muleAmount = TokenCalculator.tokensToMules(validatedUsage.total_tokens, modelInfo.tier);
  console.log('Calculated MULE amount:', muleAmount);

  try {
    // Convert ObjectId to string for comparison
    const providerIdString = providerId ? 
      (providerId instanceof mongoose.Types.ObjectId ? 
        providerId.toString() : providerId) : null;

    // Check if provider is anonymous (UUID) or registered (ObjectId)
    const isAnonymousProvider = providerIdString && 
      !mongoose.Types.ObjectId.isValid(providerIdString);
    
    if (isAnonymousProvider) {
      console.log('Anonymous provider detected:', providerIdString);
      if (validatedUsage.total_tokens > 0) {
        await TokenService.processUsage({
          consumerId,
          model: modelName, // Use string model name
          modelType: modelInfo.type || 'llm',
          modelTier: modelInfo.tier,
          rawAmount: validatedUsage.total_tokens,
          isAnonymous: true
        });
      }
    } else if (providerIdString && mongoose.Types.ObjectId.isValid(providerIdString)) {
      const usageLog = await UsageLog.create({
        consumerId,
        providerId: new mongoose.Types.ObjectId(providerIdString),
        model: modelName, // Use string model name
        modelTier: modelInfo.tier,
        tokensUsed: validatedUsage.total_tokens,
        promptTokens: validatedUsage.prompt_tokens,
        completionTokens: validatedUsage.completion_tokens,
        duration_seconds: timing.duration_seconds,
        tokens_per_second: timing.tokens_per_second,
        isSelfService: consumerId.toString() === providerIdString,
        muleAmount: muleAmount
      });

      console.log('Created usage log:', usageLog._id);

      if (validatedUsage.total_tokens > 0) {
        await TokenService.processUsage({
          consumerId,
          providerId: new mongoose.Types.ObjectId(providerIdString),
          model: modelName, // Use string model name
          modelType: modelInfo.type || 'llm',
          modelTier: modelInfo.tier,
          rawAmount: validatedUsage.total_tokens
        });
      }
    }
  } catch (error) {
    console.error('Error logging usage:', error);
  }

  return { 
    muleAmount, 
    isAnonymous: providerId && !mongoose.Types.ObjectId.isValid(providerId.toString()) 
  };
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