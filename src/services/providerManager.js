// src/services/providerManager.js
const { v4: uuidv4 } = require('uuid');

class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.pendingRequests = new Map();
    console.log('ProviderManager initialized with empty providers Map');
    this.startHealthCheck();
  }

  // Remove the singleton logic as it was causing issues
  static getInstance() {
    return new ProviderManager();
  }

  registerProvider(providerId, providerInfo) {
    console.log('\n=== Provider Registration ===');
    console.log('Registering provider:', {
      providerId,
      models: providerInfo.models,
      status: providerInfo.status
    });
    
    this.providers.set(providerId, {
      ...providerInfo,
      lastSeen: Date.now()
    });

    this.logProvidersState();
  }

  removeProvider(providerId) {
    console.log(`Removing provider: ${providerId}`);
    this.providers.delete(providerId);
    this.logProvidersState();
  }

  updateProviderStatus(providerId, status) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.status = status;
      provider.lastSeen = Date.now();
      console.log(`Provider ${providerId} status updated to: ${status}`);
    } else {
      console.log(`Provider ${providerId} not found for status update`);
    }
  }

  findAvailableProvider(model = null) {
    console.log('\n=== Finding Provider ===');
    console.log('Finding provider for model:', model);
    console.log('Current providers size:', this.providers.size);

    for (const [id, provider] of this.providers) {
      console.log('Checking provider:', id, {
        status: provider.status,
        models: provider.models,
        hasModel: !model || provider.models.includes(model)
      });

      if (provider.status === 'active' && 
          (!model || provider.models.includes(model))) {
        return { id, provider };
      }
    }
    
    return null;
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
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      
      providerInfo.provider.ws.send(JSON.stringify({
        type: 'completion_request',
        requestId,
        ...requestData
      }));
    });
  }

  handleCompletionResponse(requestId, response) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);
      pendingRequest.resolve(response);
    }
  }

  startHealthCheck() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, provider] of this.providers) {
        if (now - provider.lastSeen > 30000) {
          provider.status = 'inactive';
          console.log(`Provider ${id} marked inactive due to timeout`);
        }
        if (provider.status === 'active') {
          provider.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }
    }, 15000);
  }

  logProvidersState() {
    console.log('\n=== Current Providers State ===');
    console.log('Total providers:', this.providers.size);
    for (const [id, provider] of this.providers) {
      console.log(`- Provider ${id}:`, {
        status: provider.status,
        models: provider.models,
        lastSeen: new Date(provider.lastSeen).toISOString(),
        hasWebSocket: !!provider.ws
      });
    }
    console.log('===============================\n');
  }

  getProvidersInfo() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      models: provider.models || [],
      status: provider.status || 'unknown',
      lastSeen: provider.lastSeen ? new Date(provider.lastSeen).toISOString() : null,
      hasWebSocket: !!provider.ws
    }));
  }
}

// Export a new instance
module.exports = {
    ProviderManager,
    providerManager: new ProviderManager()
};