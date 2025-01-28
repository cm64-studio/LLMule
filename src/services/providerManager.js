// src/services/providerManager.js
const { v4: uuidv4 } = require('uuid');
const User = require('../models/userModel');
const { ModelManager } = require('../config/models');
const { Provider } = require('../models/providerModel');
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
    this.requestTimeout = process.env.REQUEST_TIMEOUT_MS || 180000; // 3 minutes default timeout

    console.log('ProviderManager initialized with heartbeat monitoring and request timeout:', this.requestTimeout, 'ms');
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
        console.log(`No provider or WebSocket found for ${socketId}, clearing heartbeat`);
        this.clearHeartbeat(socketId);
        return;
      }

      if (Date.now() - provider.lastHeartbeat > this.timeoutThreshold) {
        console.log(`Provider ${socketId} timed out after ${this.timeoutThreshold}ms - removing`);
        this.removeProvider(socketId);
        return;
      }

      try {
        provider.ws.ping();
        console.log(`Ping sent to provider ${socketId}`);
      } catch (error) {
        console.error(`Error pinging provider ${socketId}:`, {
          error: error.message,
          stack: error.stack
        });
        this.removeProvider(socketId);
      }
    }, this.heartbeatInterval);

    this.pingIntervals.set(socketId, interval);
    console.log(`Heartbeat monitor started for provider ${socketId}`);
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
      //console.log(`Received pong from provider ${socketId}`);
      const provider = this.providers.get(socketId);
      if (provider) {
        provider.lastHeartbeat = Date.now();
        provider.status = 'active';
      }
    });

    // Handle close
    ws.on('close', (code, reason) => {
      console.log(`Provider ${socketId} WebSocket closed`, {
        code,
        reason: reason.toString(),
        wasClean: code === 1000
      });
      
      // Only remove if this wasn't triggered by our own removeProvider call
      // and it wasn't a clean close
      if (reason.toString() !== 'Provider removed' && code !== 1000) {
        this.removeProvider(socketId);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`Provider ${socketId} WebSocket error:`, {
        error: error.message,
        stack: error.stack
      });
      // Don't remove provider immediately on error, let the close handler decide
    });

    // Initial ping to verify connection
    try {
      ws.ping();
      console.log(`Initial ping sent to provider ${socketId}`);
    } catch (error) {
      console.error(`Error sending initial ping to provider ${socketId}:`, error);
    }
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
    try {
      // Ensure we have a websocket instance
      if (!providerInfo.ws) {
        console.error('Provider registration failed: No WebSocket provided');
        return { success: false, status: 'error', message: 'No WebSocket provided' };
      }

      // Check if this provider is already registered
      const existingProvider = this.providers.get(socketId);
      if (existingProvider && existingProvider.status === 'active') {
        console.log('Provider already registered and active:', {
          socketId,
          userId: existingProvider.userId?.toString()
        });
        // Send success response to avoid client retries
        providerInfo.ws.send(JSON.stringify({
          type: 'registered',
          message: 'Already registered as provider'
        }));
        return { success: true, status: 'existing' };
      }

      // Check authentication methods
      const apiKey = providerInfo.apiKey || providerInfo.ws.apiKey;
      const userId = providerInfo.userId;

      if (!apiKey && !userId) {
        console.error('Provider registration failed: No authentication provided');
        return { success: false, status: 'error', message: 'No authentication provided' };
      }

      // Build query based on available authentication
      const query = {
        emailVerified: true,
        status: 'active'
      };

      if (apiKey) {
        query.apiKey = apiKey;
      } else if (userId) {
        query._id = userId;
      }

      const user = await User.findOne(query);

      if (!user) {
        console.error('Provider registration failed: Invalid or inactive user');
        return { success: false, status: 'error', message: 'Invalid or inactive user' };
      }

      // Check for duplicate models in the registration request
      const uniqueModels = [...new Set(providerInfo.models)];
      if (uniqueModels.length !== providerInfo.models.length) {
        console.error('Provider registration failed: Duplicate models detected in registration', {
          socketId,
          userId: user._id.toString(),
          duplicates: providerInfo.models.filter((model, index) => providerInfo.models.indexOf(model) !== index)
        });
        return { success: false, status: 'error', message: 'Duplicate models detected' };
      }

      const providerData = {
        ...providerInfo,
        models: uniqueModels,
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
      console.log('New provider registration:', {
        socketId,
        userId: user._id.toString(),
        hasWebSocket: !!providerData.ws,
        wsState: providerData.ws.readyState,
        models: providerData.models,
        modelCount: providerData.models.length,
        authMethod: apiKey ? 'apiKey' : 'userId'
      });

      // Send success response to client
      providerData.ws.send(JSON.stringify({
        type: 'registered',
        message: 'Successfully registered as provider'
      }));

      return { success: true, status: 'new' };
    } catch (error) {
      console.error('Provider registration failed:', error);
      return { success: false, status: 'error', message: error.message };
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
    if (provider) {
      // Log provider details before removal
      console.log(`Provider details before removal:`, {
        socketId,
        userId: provider.userId?.toString(),
        status: provider.status,
        models: provider.models,
        lastHeartbeat: new Date(provider.lastHeartbeat).toISOString()
      });

      if (provider.ws && provider.ws.readyState === WebSocket.OPEN) {
        try {
          // Only close if it's not already closing/closed
          provider.ws.close(1000, 'Provider removed');
        } catch (error) {
          console.error(`Error closing WebSocket for ${socketId}:`, error);
          try {
            provider.ws.terminate();
          } catch (termError) {
            console.error(`Error terminating WebSocket for ${socketId}:`, termError);
          }
        }
      }
    }

    // Clean up maps
    this.providers.delete(socketId);
    this.providerUserIds.delete(socketId);
    this.requestCounts.delete(socketId);
    this.performanceCache.delete(socketId);
    this.requestQueue.delete(socketId);

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

  // Helper function to generate a deterministic number from MongoDB ID
  _generateProviderNumber(userId) {
    // Convert the first 4 bytes of MongoDB ObjectId to a number
    const idHex = userId.toString().substring(0, 8);
    const number = parseInt(idHex, 16) % 1000000; // Keep it to 6 digits max
    return number.toString();
  }

  async findAvailableProvider(requestedModel) {
    let targetModel = requestedModel;
    let filterInfo = null;
    let specificProviderId = null;
   
    // Handle specific provider model requests
    if (requestedModel.includes('@')) {
      const [modelName, providerId] = requestedModel.split('@');
      targetModel = modelName;
      // Extract the number from user_XXXXXX format
      specificProviderId = providerId.startsWith('user_') ? 
        providerId.substring(5) : providerId;
    }
    // Handle tier|model format
    else if (requestedModel.includes('|')) {
      const [tier, modelType] = requestedModel.split('|');
      filterInfo = { tier, modelType };
    }
   
    const eligibleProviders = Array.from(this.providers.entries())
      .filter(([socketId, provider]) => {
        const isActive = provider.status === 'active';
        const isReady = provider.readyForRequests === true;
        const hasWebSocket = provider.ws && provider.ws.readyState === WebSocket.OPEN;
        const currentLoad = this.requestQueue.get(socketId) || 0;
        const isAvailable = currentLoad < this.loadBalancingThreshold;
        
        // If specific provider requested, check provider ID
        if (specificProviderId) {
          // Generate the provider number for comparison
          const providerNumber = this._generateProviderNumber(provider.userId);
          if (providerNumber !== specificProviderId) {
            return false;
          }
        }
   
        if (!isActive || !isReady || !hasWebSocket || !isAvailable) return false;
   
        if (filterInfo) {
          return provider.models.some(model => {
            const info = ModelManager.getModelInfo(model);
            return info.tier === filterInfo.tier && 
                   model.toLowerCase().includes(filterInfo.modelType);
          });
        }
   
        return this._checkModelCompatibility(provider.models, targetModel);
      });
   
    if (eligibleProviders.length === 0) return null;
   
    const selected = await this._selectOptimalProvider(eligibleProviders);
    
    if (filterInfo) {
      targetModel = selected.provider.models.find(model => {
        const info = ModelManager.getModelInfo(model);
        return info.tier === filterInfo.tier && 
               model.toLowerCase().includes(filterInfo.modelType);
      });
    }
   
    return {
      socketId: selected.socketId,
      provider: selected.provider,
      userId: selected.provider.userId,
      model: targetModel 
    };
  }

  _checkModelCompatibility(providerModels, requestedModel) {
    if (!requestedModel) return false;
  
    // Handle specific provider model requests (model@userId format)
    if (requestedModel.includes('@')) {
      const [modelName, providerId] = requestedModel.split('@');
      // Check if this provider has this exact model
      return providerModels.some(model => 
        this._isExactModelMatch(model, modelName)
      );
    }

    // Handle combined type|model requests 
    if (requestedModel.includes('|')) {
      const [tier, modelType] = requestedModel.toLowerCase().split('|');
      
      return providerModels.some(model => {
        const info = ModelManager.getModelInfo(model);
        return info.tier === tier && model.toLowerCase().includes(modelType);
      });
    }
  
    // Rest of existing compatibility logic
    if (['small', 'medium', 'large', 'xl'].includes(requestedModel)) {
      return providerModels.some(model => {
        const info = ModelManager.getModelInfo(model);
        return info.tier === requestedModel;
      });
    }
  
    return providerModels.some(model => this._isExactModelMatch(model, requestedModel));
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
      if (!userId) {
        return { 
          tokens_per_second: 0,
          total_requests: 0
        };
      }

      // First check the performance cache
      const socketId = Array.from(this.providers.entries())
        .find(([_, provider]) => provider.userId?.toString() === userId?.toString())?.[0];
      
      if (socketId) {
        const cachedPerf = this.performanceCache.get(socketId);
        // Reduce cache time to 1 minute for more frequent updates
        if (cachedPerf && Date.now() - cachedPerf.last_updated < 60000) {
          return { 
            tokens_per_second: cachedPerf.tokens_per_second,
            total_requests: cachedPerf.total_requests || 0
          };
        }
      }

      // If not in cache or expired, get from database
      const provider = await Provider.findOne(
        { userId: userId },
        { 
          'performance.history': { $slice: -5 }, // Only get last 5 entries for more recent performance
          'performance.total_requests': 1,
          'performance.successful_requests': 1,
          'performance.failed_requests': 1
        }
      );

      if (!provider?.performance) {
        return { 
          tokens_per_second: 0,
          total_requests: 0
        };
      }

      // Calculate weighted average giving more importance to recent entries
      const recentPerformance = provider.performance.history || [];
      let totalWeight = 0;
      const avgTokensPerSecond = recentPerformance.length > 0 ? 
        recentPerformance.reduce((acc, curr, idx) => {
          // Weight formula: newer entries get higher weight
          const weight = Math.pow(2, idx); // 1, 2, 4, 8, 16 for last 5 entries
          totalWeight += weight;
          return acc + (curr.tokens_per_second || 0) * weight;
        }, 0) / totalWeight : 0;

      const totalRequests = provider.performance.total_requests || 0;

      // Update cache
      if (socketId) {
        this.performanceCache.set(socketId, {
          tokens_per_second: avgTokensPerSecond,
          total_requests: totalRequests,
          last_updated: Date.now()
        });
      }

      return { 
        tokens_per_second: avgTokensPerSecond,
        total_requests: totalRequests
      };
    } catch (error) {
      console.error('Error getting provider performance:', error);
      return { 
        tokens_per_second: 0,
        total_requests: 0
      };
    }
  }


  async routeRequest(requestData) {
    const providerInfo = await this.findAvailableProvider(requestData.model);
   
    if (!providerInfo) throw new Error('No available providers');
   
    const provider = this.providers.get(providerInfo.socketId);
    if (!provider?.ws) throw new Error('Provider WebSocket not available');
   
    const requestId = uuidv4();
    
    return new Promise((resolve, reject) => {
      // Set timeout (use configured timeout or default to 60 seconds)
      const timeoutDuration = requestData.timeout || this.requestTimeout;
      const timeout = setTimeout(() => {
        this._handleRequestTimeout(requestId, providerInfo.socketId);
        reject(new Error(`Request timeout after ${timeoutDuration/1000} seconds`)); 
      }, timeoutDuration);
   
      this.pendingRequests.set(requestId, {
        resolve,
        reject, 
        timeout,
        socketId: providerInfo.socketId,
        providerId: providerInfo.userId,
        startTime: Date.now() // Record exact start time when request is about to be sent
      });
   
      try {
        // Update request queue count
        const currentQueue = this.requestQueue.get(providerInfo.socketId) || 0;
        this.requestQueue.set(providerInfo.socketId, currentQueue + 1);

        const message = {
          type: 'completion_request',
          requestId,
          model: providerInfo.model,
          messages: requestData.messages,
          temperature: requestData.temperature,
          max_tokens: requestData.max_tokens
        };
   
        // Start timing just before sending the request
        const RequestTimer = require('../utils/requestTimer');
        RequestTimer.startRequest(requestId);
   
        provider.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            RequestTimer.endRequest(requestId, 0); // End timing on error
            this._handleRequestTimeout(requestId, providerInfo.socketId);
            reject(new Error('Failed to send request to provider'));
          }
        });
      } catch (error) {
        RequestTimer.endRequest(requestId, 0); // End timing on error
        this._handleRequestTimeout(requestId, providerInfo.socketId);
        reject(error); 
      }
    });
  }

  _handleRequestTimeout(requestId, socketId) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) return;

    // Clear the timeout
    clearTimeout(pendingRequest.timeout);
    
    // Update request queue count
    const currentQueue = this.requestQueue.get(socketId) || 1;
    this.requestQueue.set(socketId, Math.max(0, currentQueue - 1));
    
    // Calculate duration and update provider performance with failed request
    const duration = (Date.now() - pendingRequest.startTime) / 1000;
    const performance = {
      tokens_per_second: 0,
      duration_seconds: duration,
      total_tokens: 0,
      success: false
    };

    // Log timeout for debugging
    console.log('Request timeout:', {
      requestId,
      socketId,
      duration_seconds: duration,
      provider: this.providers.get(socketId)?.userId?.toString()
    });
    
    this.updateProviderPerformance(socketId, performance);
    
    // Clean up the pending request
    this.pendingRequests.delete(requestId);
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

  async updateProviderPerformance(socketId, performance) {
    try {
      const provider = this.providers.get(socketId);
      if (!provider || !provider.userId) return;

      // Validate performance data
      const validatedPerformance = {
        tokens_per_second: Math.max(0, parseInt(performance.tokens_per_second) || 0),
        duration_seconds: Math.max(0, parseFloat(performance.duration_seconds) || 0),
        total_tokens: Math.max(0, parseInt(performance.total_tokens) || 0),
        success: Boolean(performance.success) // Ensure it's a boolean
      };

      // Update performance cache with request count
      const currentCache = this.performanceCache.get(socketId) || {};
      this.performanceCache.set(socketId, {
        tokens_per_second: validatedPerformance.tokens_per_second,
        total_requests: (currentCache.total_requests || 0) + 1,
        last_updated: Date.now()
      });

      // Log performance update for debugging
      console.log('Updating provider performance:', {
        providerId: provider.userId.toString(),
        socketId,
        performance: {
          ...validatedPerformance,
          cached_total_requests: (currentCache.total_requests || 0) + 1
        }
      });

      // Update Provider model with atomic operations
      const result = await Provider.findOneAndUpdate(
        { userId: provider.userId },
        {
          $push: {
            'performance.history': {
              timestamp: new Date(),
              tokens_per_second: validatedPerformance.tokens_per_second,
              duration_seconds: validatedPerformance.duration_seconds,
              success: validatedPerformance.success
            }
          },
          $inc: {
            'performance.total_requests': 1,
            'performance.successful_requests': validatedPerformance.success ? 1 : 0,
            'performance.failed_requests': validatedPerformance.success ? 0 : 1,
            'performance.total_tokens': validatedPerformance.total_tokens
          }
        },
        { 
          upsert: true,
          new: true
        }
      );

      // Log the updated totals
      console.log('Provider performance updated:', {
        providerId: provider.userId.toString(),
        total_requests: result?.performance?.total_requests || 0,
        successful_requests: result?.performance?.successful_requests || 0,
        failed_requests: result?.performance?.failed_requests || 0,
        total_tokens: result?.performance?.total_tokens || 0
      });

    } catch (error) {
      console.error('Error updating provider performance:', {
        error: error.message,
        stack: error.stack,
        socketId,
        provider: this.providers.get(socketId)?.userId?.toString()
      });
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

      // Check if response is valid
      const isValidResponse = response && 
        response.choices && 
        Array.isArray(response.choices) && 
        response.choices.length > 0 &&
        response.choices[0].message &&
        response.choices[0].message.content;

      // Get timing from RequestTimer
      const RequestTimer = require('../utils/requestTimer');
      const timing = RequestTimer.endRequest(requestId, response?.usage?.completion_tokens || 0);

      // Calculate tokens per second based only on completion tokens
      const tokensPerSecond = timing && response?.usage?.completion_tokens ? 
        Math.round(response.usage.completion_tokens / timing.duration_seconds) : 0;

      // Update performance metrics with accurate timing
      const performance = {
        tokens_per_second: tokensPerSecond,
        duration_seconds: timing?.duration_seconds || 0,
        total_tokens: response?.usage?.total_tokens || 0,
        success: isValidResponse
      };
      
      // Log performance metrics for debugging
      console.log('Performance metrics for request:', {
        requestId,
        socketId: pendingRequest.socketId,
        performance,
        responseValid: isValidResponse,
        timing: timing || null,
        usage: response?.usage
      });

      this.updateProviderPerformance(pendingRequest.socketId, performance);

      // Add timing to response
      if (timing && response) {
        response.usage = {
          ...response.usage,
          duration_seconds: timing.duration_seconds,
          tokens_per_second: tokensPerSecond
        };
      }

      // Complete the request
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);

      if (!isValidResponse) {
        pendingRequest.reject(new Error('Invalid response format: missing message content'));
      } else {
        pendingRequest.resolve(response);
      }

    } catch (error) {
      console.error('Error handling completion response:', error);
      
      // Update performance metrics for failed request
      const performance = {
        tokens_per_second: 0,
        duration_seconds: 0,
        total_tokens: 0,
        success: false
      };
      this.updateProviderPerformance(pendingRequest.socketId, performance);
      
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