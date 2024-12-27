// controllers/llmController.js
const { ModelManager } = require('../config/models');
const { providerManager } = require('../services/providerManager');
const TokenService = require('../services/tokenService');
const { TokenCalculator } = require('../config/tokenomics');
const RequestTimer = require('../utils/requestTimer');
const UsageLog = require('../models/usageLogModel');

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
  if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
    const providers = providerManager.getProvidersInfo();
    const availableModels = providers
      .filter(p => p.status === 'active')
      .map(provider => ({
        provider: provider.id,
        models: provider.models.filter(model => {
          const info = ModelManager.getModelInfo(model);
          return info?.tier === requestedModel;
        })
      }))
      .filter(p => p.models.length > 0);
    if (availableModels.length === 0) {
      throw new Error(`No available models for tier: ${requestedModel}`);
    }
    const selected = availableModels[Math.floor(Math.random() * availableModels.length)];
    return {
      selectedModel: selected.models[0],
      selectedProvider: selected.provider
    };
  }

  if (!ModelManager.validateModel(requestedModel)) {
    throw new Error("Invalid model specified");
  }

  const provider = providerManager.findAvailableProvider(requestedModel);
  if (!provider) {
    throw new Error("No provider available for the requested model");
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
  console.log('Logging usage:', { consumerId, providerId, model, usage, timing });
  
  const muleAmount = TokenCalculator.tokensToMules(usage.total_tokens, modelInfo.tier);
  console.log('Calculated MULE amount:', muleAmount);

  try {
    // Create usage log if we have a valid provider ID
    if (providerId && providerId.match(/^[0-9a-fA-F]{24}$/)) {
      const usageLog = await UsageLog.create({
        consumerId,
        providerId,
        model,
        modelTier: modelInfo.tier,
        tokensUsed: usage.total_tokens,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        duration_seconds: timing.duration_seconds,
        tokens_per_second: timing.tokens_per_second,
        isSelfService: consumerId.toString() === providerId.toString(),
        muleAmount: muleAmount
      });
      console.log('Created usage log:', usageLog);
    } else {
      console.log('Skipping usage log - invalid provider ID:', providerId);
    }

    // Process token usage if we have tokens
    if (usage.total_tokens > 0) {
      const tokenUsage = await TokenService.processUsage({
        consumerId,
        providerId,
        model,
        modelType: modelInfo.type || 'llm',
        modelTier: modelInfo.tier,
        rawAmount: usage.total_tokens
      });
      console.log('Processed token usage:', tokenUsage);
    } else {
      console.log('Skipping token processing - no tokens used');
    }
  } catch (error) {
    console.error('Error logging usage:', error);
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
  res.status(500).json({
    error: {
      message: error.message || 'Failed to process request',
      type: "server_error",
      code: "internal_error"
    }
  });
}

module.exports = { handleLLMRequest };