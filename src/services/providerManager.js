const { v4: uuidv4 } = require('uuid');
const User = require('../models/userModel');

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
    console.log('\n=== Provider Registration ===');
    console.log('Registering provider:', { socketId, models: providerInfo.models });
    
    try {
      let userId = null;
      if (providerInfo.apiKey) {
        const user = await User.findOne({ 
          apiKey: providerInfo.apiKey,
          emailVerified: true,
          status: 'active'
        });

        if (user) {
          userId = user._id;
          await user.registerAsProvider(providerInfo.models);
          this.providerUserIds.set(socketId, userId);
        }
      }

      this.providers.set(socketId, {
        ...providerInfo,
        userId,
        lastHeartbeat: Date.now(),
        status: 'active'
      });
      
      this.requestCounts.set(socketId, 0);
      this.handleConnection(providerInfo.ws, socketId);

      console.log('Provider registered:', {
        socketId,
        userId: userId ? userId.toString() : 'anonymous',
        models: providerInfo.models
      });

      this.logProvidersState();
      return true;

    } catch (error) {
      console.error('Provider registration failed:', error);
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
      provider.status = status;
      provider.lastHeartbeat = Date.now();
      console.log(`Provider ${socketId} status updated to: ${status}`);
    }
  }

  findAvailableProvider(model = null) {
    console.log('\n=== Finding Provider with Load Balancing ===');
    console.log('Finding provider for model:', model);
    
    const eligibleProviders = Array.from(this.providers.entries())
      .filter(([_, provider]) => 
        provider.status === 'active' && 
        (!model || provider.models.includes(model))
      );

    if (eligibleProviders.length === 0) {
      console.log('No eligible providers found');
      return null;
    }

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
      console.log(`- Provider ${id}:`, {
        status: provider.status,
        userId: provider.userId ? provider.userId.toString() : 'anonymous',
        models: provider.models,
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