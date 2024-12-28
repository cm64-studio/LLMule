const { v4: uuidv4 } = require('uuid');
const User = require('../models/userModel');
const { ModelManager } = require('../config/models');

class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.pendingRequests = new Map();
    this.requestCounts = new Map();
    this.providerUserIds = new Map();
    this.heartbeatInterval = 15000; // 15s
    this.timeoutThreshold = 45000; // 45s
    console.log('ProviderManager initialized with heartbeat monitoring');
    this.startHeartbeatMonitor();
  }

  startHeartbeatMonitor() {
    setInterval(() => {
      const now = Date.now();
      for (const [socketId, provider] of this.providers) {
        const ws = provider.ws;

        if (!ws.isAlive) {
          console.log(`Provider ${socketId} connection lost - removing`);
          this.removeProvider(socketId);
          continue;
        }

        if (now - provider.lastHeartbeat > this.timeoutThreshold) {
          provider.status = 'inactive';
          this.requestCounts.set(socketId, 0);
          console.log(`Provider ${socketId} marked inactive due to timeout`);
          continue;
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, this.heartbeatInterval);
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
    console.log('\n=== Provider Registration Debug ===');
    console.log('Raw provider info:', {
      socketId,
      models: providerInfo.models,
      hasApiKey: !!providerInfo.apiKey
    });
    
    try {
      let userId = null;
      if (providerInfo.apiKey) {
        const user = await User.findOne({ 
          apiKey: providerInfo.apiKey,
          emailVerified: true,
          status: 'active'
        });
  
        console.log('User lookup result:', {
          found: !!user,
          userId: user?._id?.toString(),
          status: user?.status,
          verified: user?.emailVerified
        });
  
        if (user) {
          userId = user._id;
          
          // Format and normalize model names
          const formattedModels = providerInfo.models.map(model => {
            console.log('Processing model:', model);
            const modelInfo = ModelManager.getModelInfo(model);
            console.log('Model classification:', {
              name: model,
              info: modelInfo
            });

            // If it's already an object, use it
            if (typeof model === 'object') {
              return {
                name: model.name,
                type: model.type || 'llm',
                tier: modelInfo?.tier || 'medium'
              };
            }
            // If it's a string, create an object
            return {
              name: model,
              type: 'llm',
              tier: modelInfo?.tier || 'medium'
            };
          });
  
          console.log('Formatted models:', formattedModels);
  
          // Update user's provider status
          const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
              $set: {
                'provider.isProvider': true,
                'provider.models': formattedModels,
                'provider.lastSeen': new Date()
              }
            },
            { new: true }
          );
  
          console.log('Updated user provider status:', {
            isProvider: updatedUser.provider.isProvider,
            modelCount: updatedUser.provider.models.length,
            models: updatedUser.provider.models
          });
  
        } else {
          console.error('No valid user found for API key');
          return false;
        }
      }
  
      // Store provider information with formatted models
      const providerData = {
        ...providerInfo,
        models: formattedModels || providerInfo.models, // Use formatted if available
        userId,
        lastHeartbeat: Date.now(),
        status: 'active',
        readyForRequests: true
      };

      this.providers.set(socketId, providerData);
      
      if (userId) {
        this.providerUserIds.set(socketId, userId);
      }
      
      this.requestCounts.set(socketId, 0);
      
      console.log('Provider registration complete:', {
        socketId,
        userId: userId?.toString(),
        modelCount: providerData.models.length,
        models: providerData.models,
        status: 'active'
      });

      // Log current provider state
      this.logProvidersState();
  
      return true;
  
    } catch (error) {
      console.error('Provider registration failed:', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  removeProvider(socketId) {
    console.log(`Removing provider: ${socketId}`);
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

  findAvailableProvider(model = null) {
    console.log('\n=== Finding Provider Debug ===');
    console.log('Looking for model:', model);

    // Get all active providers
    const eligibleProviders = Array.from(this.providers.entries())
      .filter(([_, provider]) => {
        const isActive = provider.status === 'active';
        const isReady = provider.readyForRequests === true;
        
        console.log('Provider status check:', {
          providerId: _.substring(0, 8),
          active: isActive,
          ready: isReady,
          modelCount: provider.models?.length || 0
        });
        
        return isActive && isReady;
      })
      .filter(([_, provider]) => {
        if (!model) return true;
        
        // Check if provider has matching model
        const hasModel = provider.models.some(providerModel => {
          // Get model info for both requested and provider model
          const requestedInfo = ModelManager.getModelInfo(model);
          const providerInfo = ModelManager.getModelInfo(providerModel);
          
          console.log('Model comparison:', {
            requested: {
              name: model,
              tier: requestedInfo?.tier
            },
            provider: {
              name: providerModel,
              tier: providerInfo?.tier
            }
          });

          // Match by exact name or matching tier
          return providerModel === model || 
                 (requestedInfo?.tier && requestedInfo.tier === providerInfo?.tier);
        });

        console.log('Provider model check:', {
          providerId: _.substring(0, 8),
          hasModel,
          availableModels: provider.models
        });

        return hasModel;
      });

    if (eligibleProviders.length === 0) {
      console.log('No eligible providers found');
      return null;
    }

    // Add more detailed logging
    console.log('Eligible providers:', eligibleProviders.map(([id, p]) => ({
      id: id.substring(0, 8),
      models: p.models,
      load: this.requestCounts.get(id) || 0
    })));

    const providersByLoad = eligibleProviders
      .map(([socketId, provider]) => ({
        socketId,
        provider,
        load: this.requestCounts.get(socketId) || 0
      }))
      .sort((a, b) => a.load - b.load);

    const selected = providersByLoad[0];
    this.requestCounts.set(selected.socketId,
      (this.requestCounts.get(selected.socketId) || 0) + 1
    );

    console.log('Selected provider:', {
      socketId: selected.socketId.substring(0, 8),
      currentLoad: this.requestCounts.get(selected.socketId),
      selectedModels: selected.provider.models
    });

    return {
      socketId: selected.socketId,
      provider: selected.provider,
      userId: selected.provider.userId
    };
  }


  async routeRequest(requestData) {
    console.log('Routing request for model:', requestData.model);
    const providerInfo = this.findAvailableProvider(requestData.model);

    if (!providerInfo) {
      throw new Error('No available providers');
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
        providerId: providerInfo.provider.userId
      });

      providerInfo.provider.ws.send(JSON.stringify({
        type: 'completion_request',
        requestId,
        ...requestData
      }));
    });
  }

  handleCompletionResponse(requestId, response) {
    console.log('\n=== Handling Completion Response ===');
    console.log('Request ID:', requestId);

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.error('No pending request found for ID:', requestId);
      return;
    }

    try {
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);

      if (pendingRequest.socketId) {
        const currentCount = this.requestCounts.get(pendingRequest.socketId) || 1;
        this.requestCounts.set(pendingRequest.socketId, currentCount - 1);
      }

      if (response.error) {
        console.error('Error in provider response:', response.error);
        pendingRequest.reject(new Error(response.error));
        return;
      }

      if (!response.choices || !response.choices[0]?.message?.content) {
        console.error('Invalid response structure:', response);
        pendingRequest.reject(new Error('Invalid response from provider'));
        return;
      }

      console.log('Successfully handled response');
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
      userId: provider.userId ? provider.userId.toString() : 'anonymous',
      models: provider.models || [],
      status: provider.status || 'unknown',
      lastHeartbeat: provider.lastHeartbeat ? new Date(provider.lastHeartbeat).toISOString() : null,
      hasWebSocket: !!provider.ws,
      currentLoad: this.requestCounts.get(id) || 0
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