// src/services/providerManager.js
const { v4: uuidv4 } = require('uuid');
const User = require('../models/userModel');
const { ModelManager } = require('../config/models');
const Provider = require('../models/providerModel');
const WebSocket = require('ws');
class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.pendingRequests = new Map();
    this.requestCounts = new Map();
    this.providerUserIds = new Map();
    this.heartbeatInterval = 15000; // 15 seconds
    this.timeoutThreshold = 45000;  // 45 seconds
    this.pingIntervals = new Map(); // Track ping intervals per provider
    this.requestQueue = new Map(); // Track pending requests per provider
    this.performanceCache = new Map(); // Cache provider performance metrics
    this.loadBalancingThreshold = 5; // Max requests before load balancing kicks in

    console.log('ProviderManager initialized with heartbeat monitoring');
  }

  startHeartbeatMonitor(socketId) {
    // Clear any existing interval
    if (this.pingIntervals.has(socketId)) {
      clearInterval(this.pingIntervals.get(socketId));
    }

    // Start new heartbeat interval
    const interval = setInterval(() => {
      const provider = this.providers.get(socketId);
      if (!provider || !provider.ws) {
        this.clearHeartbeat(socketId);
        return;
      }

      if (Date.now() - provider.lastHeartbeat > this.timeoutThreshold) {
        console.log(`Provider ${socketId} timed out - removing`);
        this.removeProvider(socketId);
        return;
      }

      try {
        provider.ws.ping();
      } catch (error) {
        console.error(`Error pinging provider ${socketId}:`, error);
        this.removeProvider(socketId);
      }
    }, this.heartbeatInterval);

    this.pingIntervals.set(socketId, interval);
  }

  clearHeartbeat(socketId) {
    if (this.pingIntervals.has(socketId)) {
      clearInterval(this.pingIntervals.get(socketId));
      this.pingIntervals.delete(socketId);
    }
  }

  setupWebSocketHandlers(socketId, ws) {
    // Handle pong responses
    ws.on('pong', () => {
      const provider = this.providers.get(socketId);
      if (provider) {
        provider.lastHeartbeat = Date.now();
        provider.status = 'active';
      }
    });

    // Handle close
    ws.on('close', () => {
      console.log(`Provider ${socketId} WebSocket closed`);
      this.removeProvider(socketId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`Provider ${socketId} WebSocket error:`, error);
      this.removeProvider(socketId);
    });
  }

  handleConnection(ws, providerId) {
    ws.isAlive = true;
    ws.lastHeartbeat = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastHeartbeat = Date.now();
      this.updateProviderStatus(providerId, 'active');
    });
  }


  async registerProvider(socketId, providerInfo) {
    if (!providerInfo.apiKey) {
      console.error('Provider registration failed: No API key provided');
      return false;
    }

    try {
      const user = await User.findOne({
        apiKey: providerInfo.apiKey,
        emailVerified: true,
        status: 'active'
      });

      if (!user) {
        console.error('Provider registration failed: Invalid or inactive user');
        return false;
      }

      // Ensure we have a websocket instance
      if (!providerInfo.ws) {
        console.error('Provider registration failed: No WebSocket provided');
        return false;
      }

      const providerData = {
        ...providerInfo,
        userId: user._id,
        lastHeartbeat: Date.now(),
        status: 'active',
        readyForRequests: true,
        ws: providerInfo.ws
      };

      // Store provider data
      this.providers.set(socketId, providerData);
      this.providerUserIds.set(socketId, user._id);
      this.requestCounts.set(socketId, 0);

      // Setup WebSocket handlers
      this.setupWebSocketHandlers(socketId, providerData.ws);
      
      // Start heartbeat monitoring
      this.startHeartbeatMonitor(socketId);

      // Log registration with proper array format
      console.log('Provider registered successfully:', {
        socketId,
        userId: user._id.toString(),
        hasWebSocket: !!providerData.ws,
        wsState: providerData.ws.readyState,
        models: providerData.models // Log the array directly
      });

      // Debug log model tiers
      console.log('Registered models tiers:', providerData.models.map(model => ({
        model,
        tier: ModelManager.getModelInfo(model).tier
      })));

      return true;
    } catch (error) {
      console.error('Provider registration failed:', error);
      return false;
    }
  }

  // Add helper method to get userId from socketId
  getUserIdFromSocketId(socketId) {
    return this.providerUserIds.get(socketId);
  }

  removeProvider(socketId) {
    console.log(`Removing provider: ${socketId}`);

    // Clear heartbeat interval
    this.clearHeartbeat(socketId);

    // Clean up provider data
    const provider = this.providers.get(socketId);
    if (provider && provider.ws) {
      try {
        provider.ws.terminate();
      } catch (error) {
        console.error(`Error terminating WebSocket for ${socketId}:`, error);
      }
    }

    this.providers.delete(socketId);
    this.providerUserIds.delete(socketId);
    this.requestCounts.delete(socketId);

    this.logProvidersState();
  }

  updateProviderStatus(socketId, status) {
    const provider = this.providers.get(socketId);
    if (provider) {
      if (provider.status !== status) {
        console.log(`Provider ${socketId} status changed from ${provider.status} to: ${status}`);
        provider.status = status;
      }
      provider.lastHeartbeat = Date.now();
    }
  }




  // In providerManager.js

  async findAvailableProvider(requestedModel) {
    console.log('\n=== Finding Provider Debug ===');
    console.log('Looking for model:', requestedModel);

    // Get all active providers
    const eligibleProviders = Array.from(this.providers.entries())
      .filter(([socketId, provider]) => {
        const isActive = provider.status === 'active';
        const isReady = provider.readyForRequests === true;
        const hasWebSocket = provider.ws && provider.ws.readyState === WebSocket.OPEN;
        const currentLoad = this.requestQueue.get(socketId) || 0;
        const isAvailable = currentLoad < this.loadBalancingThreshold;

        // Check if provider has the exact model or compatible tier
        const hasCompatibleModel = this._checkModelCompatibility(provider.models, requestedModel);

        console.log('Provider eligibility check:', {
          socketId,
          models: provider.models,
          isActive,
          isReady,
          hasWebSocket,
          currentLoad,
          isAvailable,
          hasCompatibleModel,
          requestedModel
        });

        return isActive && isReady && hasWebSocket && isAvailable && hasCompatibleModel;
      });

    if (eligibleProviders.length === 0) {
      console.log('No eligible providers found');
      return null;
    }

    // First, try to find providers with exact model match
    const exactMatches = eligibleProviders.filter(([_, provider]) =>
      provider.models.some(m => this._isExactModelMatch(m, requestedModel))
    );

    // Use exact matches if available, otherwise use tier-compatible providers
    const matchingProviders = exactMatches.length > 0 ? exactMatches : eligibleProviders;

    // Sort and select best provider based on load and performance
    const selected = await this._selectOptimalProvider(matchingProviders);

    // Update request queue for selected provider
    const currentQueue = this.requestQueue.get(selected.socketId) || 0;
    this.requestQueue.set(selected.socketId, currentQueue + 1);

    console.log('Selected provider:', {
      socketId: selected.socketId,
      userId: selected.provider.userId,
      currentLoad: currentQueue + 1,
      score: selected.score,
      performance: selected.performance,
      models: selected.provider.models
    });

    return {
      socketId: selected.socketId,
      provider: selected.provider,
      userId: selected.provider.userId
    };
  }

  _checkModelCompatibility(providerModels, requestedModel) {
    console.log('Checking compatibility:', {
      providerModels,
      requestedModel
    });
  
    // If it's a tier request (small, medium, large, xl)
    if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
      const hasCompatibleModel = providerModels.some(model => {
        const modelInfo = ModelManager.getModelInfo(model);
        const isCompatible = modelInfo.tier === requestedModel;
        console.log('Tier compatibility check:', {
          model,
          tier: modelInfo.tier,
          requestedTier: requestedModel,
          isCompatible
        });
        return isCompatible;
      });
      return hasCompatibleModel;
    }
    
    // For specific model requests, first try exact match
    const hasExactMatch = providerModels.some(model => 
      this._isExactModelMatch(model, requestedModel)
    );
    
    if (hasExactMatch) return true;
  
    // If no exact match, don't fall back to tier matching for specific model requests
    return false;
  }

  _isExactModelMatch(providerModel, requestedModel) {
    // Normalize both model names for comparison
    const normalizeModelName = (name) => {
      // Remove version tags, paths, etc
      return name.split(':')[0].split('/').pop().toLowerCase();
    };
  
    const normalizedProvider = normalizeModelName(providerModel);
    const normalizedRequested = normalizeModelName(requestedModel);
  
    return normalizedProvider === normalizedRequested;
  }

  _calculateProviderScore(load, tokensPerSecond) {
    // Normalize load (0-1 where 0 is best)
    const normalizedLoad = load / this.loadBalancingThreshold;

    // Normalize performance (0-1 where 1 is best)
    const normalizedPerformance = Math.min(tokensPerSecond / 100, 1);

    // Weight factors (adjust these based on priorities)
    const loadWeight = 0.6;
    const performanceWeight = 0.4;

    // Calculate final score (0-1 where 1 is best)
    return (1 - normalizedLoad) * loadWeight + normalizedPerformance * performanceWeight;
  }

  async _selectOptimalProvider(providers) {
    // Get performance metrics for providers
    const scoredProviders = await Promise.all(
      providers.map(async ([socketId, provider]) => {
        const performance = await this._getProviderPerformance(provider.userId);
        const load = this.requestQueue.get(socketId) || 0;
        const score = this._calculateProviderScore(load, performance.tokens_per_second);
        
        return {
          socketId,
          provider,
          load,
          performance,
          score
        };
      })
    );
  
    // Select the provider with the best score
    return scoredProviders.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }

  async _rankProviders(providers) {
    const providerScores = await Promise.all(
      providers.map(async ([socketId, provider]) => {
        const performance = this.performanceCache.get(socketId) ||
          await this._getProviderPerformance(provider.userId);
        const currentLoad = this.requestQueue.get(socketId) || 0;

        // Calculate score based on performance and load
        const performanceScore = performance.tokens_per_second || 0;
        const loadScore = 1 / (currentLoad + 1); // Lower load = higher score
        const totalScore = (performanceScore * 0.7) + (loadScore * 0.3);

        return {
          socketId,
          provider,
          score: totalScore
        };
      })
    );

    // Sort by score (higher is better)
    return providerScores
      .sort((a, b) => b.score - a.score)
      .map(({ socketId, provider }) => ({ socketId, provider }));
  }

  async _getProviderPerformance(userId) {
    try {
      const provider = await Provider.findOne(
        { userId },
        { 'performance.history': { $slice: -10 } }
      );

      if (!provider?.performance?.history?.length) {
        return { tokens_per_second: 0 };
      }

      // Calculate average performance from recent history
      const recentPerformance = provider.performance.history;
      const avgTokensPerSecond = recentPerformance.reduce(
        (acc, curr) => acc + curr.tokens_per_second, 0
      ) / recentPerformance.length;

      return { tokens_per_second: avgTokensPerSecond };
    } catch (error) {
      console.error('Error getting provider performance:', error);
      return { tokens_per_second: 0 };
    }
  }


  async routeRequest(requestData) {
    console.log('\n=== Routing Request ===');
    console.log('Request data:', {
      model: requestData.model,
      messagesCount: requestData.messages?.length,
      temperature: requestData.temperature,
      maxTokens: requestData.max_tokens
    });

    // Add await here
    const providerInfo = await this.findAvailableProvider(requestData.model);

    console.log('Provider Info:', {
      found: !!providerInfo,
      socketId: providerInfo?.socketId,
      hasWs: !!(providerInfo?.provider?.ws),
      wsState: providerInfo?.provider?.ws?.readyState
    });

    if (!providerInfo) {
      throw new Error('No available providers');
    }

    const provider = this.providers.get(providerInfo.socketId);
    if (!provider || !provider.ws) {
      console.error('Provider state check:', {
        hasProvider: !!provider,
        hasWs: !!(provider?.ws),
        wsState: provider?.ws?.readyState
      });
      throw new Error('Provider WebSocket not available');
    }

    const requestId = uuidv4();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        const currentCount = this.requestCounts.get(providerInfo.socketId) || 1;
        this.requestCounts.set(providerInfo.socketId, currentCount - 1);
        reject(new Error('Request timeout after 5 minutes'));
      }, 300000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        socketId: providerInfo.socketId,
        providerId: providerInfo.userId
      });

      try {
        const message = {
          type: 'completion_request',
          requestId,
          model: requestData.model,
          messages: requestData.messages,
          temperature: requestData.temperature,
          max_tokens: requestData.max_tokens
        };

        console.log('Sending WebSocket message:', {
          type: message.type,
          requestId,
          model: message.model,
          socketId: providerInfo.socketId
        });

        provider.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            console.error('WebSocket send error:', error);
            clearTimeout(timeout);
            this.pendingRequests.delete(requestId);
            reject(new Error('Failed to send request to provider'));
          } else {
            console.log('WebSocket message sent successfully');
          }
        });
      } catch (error) {
        console.error('Error sending request:', error);
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  _matchModelTier(providerModel, requestedModel) {
    // Get model info from ModelManager
    const { ModelManager } = require('../config/models');

    // Handle object or string models
    const providerModelName = typeof providerModel === 'object' ?
      providerModel.name : providerModel;
    const requestedModelName = typeof requestedModel === 'object' ?
      requestedModel.name : requestedModel;

    try {
      // Get tier in o for both models
      const providerModelInfo = ModelManager.getModelInfo(providerModelName);
      const requestedModelInfo = ModelManager.getModelInfo(requestedModelName);

      // Match if tiers are the same
      return providerModelInfo.tier === requestedModelInfo.tier;
    } catch (error) {
      console.error('Error matching model tiers:', error);
      return false;
    }
  }

  handleCompletionResponse(requestId, response) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.error('No pending request found for ID:', requestId);
      return;
    }

    try {
      // Update request queue count
      const currentQueue = this.requestQueue.get(pendingRequest.socketId) || 1;
      this.requestQueue.set(pendingRequest.socketId, Math.max(0, currentQueue - 1));

      // Update performance cache if successful
      if (response.usage) {
        this.performanceCache.set(pendingRequest.socketId, {
          tokens_per_second: response.usage.tokens_per_second,
          last_updated: Date.now()
        });
      }

      // Complete the request
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);
      pendingRequest.resolve(response);

    } catch (error) {
      console.error('Error handling completion response:', error);
      pendingRequest.reject(error);
    }
  }

  logProvidersState() {
    console.log('\n=== Current Providers State ===');
    console.log('Total providers:', this.providers.size);

    for (const [id, provider] of this.providers) {
      console.log(`Provider ${id}:`, {
        status: provider.status,
        userId: provider.userId ? provider.userId.toString() : 'anonymous',
        models: provider.models.map(m => ({
          name: m.name || m,
          tier: m.tier || 'unknown'
        })),
        lastHeartbeat: new Date(provider.lastHeartbeat).toISOString(),
        hasWebSocket: !!provider.ws,
        currentLoad: this.requestCounts.get(id) || 0
      });
    }
    console.log('===============================\n');
  }

  getProvidersInfo() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      userId: provider.userId?.toString(),  // Ensure userId is string
      models: Array.isArray(provider.models) ? provider.models : [],
      status: provider.status || 'unknown',
      lastHeartbeat: provider.lastHeartbeat ? new Date(provider.lastHeartbeat).toISOString() : null,
      hasWebSocket: !!provider.ws && provider.ws.readyState === WebSocket.OPEN
    }));
  }

  getLoadBalancingStats() {
    return Array.from(this.requestCounts.entries()).map(([id, count]) => ({
      providerId: id,
      activeRequests: count,
      provider: this.providers.get(id)?.status
    }));
  }
}

module.exports = {
  ProviderManager,
  providerManager: new ProviderManager()
};