const { v4: uuidv4 } = require('uuid');

class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.pendingRequests = new Map();
    this.requestCounts = new Map();
    console.log('ProviderManager initialized with load balancing');
    this.startHealthCheck();
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
    
    // Initialize request count for new provider
    this.requestCounts.set(providerId, 0);

    this.logProvidersState();
  }

  removeProvider(providerId) {
    console.log(`Removing provider: ${providerId}`);
    this.providers.delete(providerId);
    this.requestCounts.delete(providerId);
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

    // Load balancing logic
    const providersByLoad = eligibleProviders.map(([id, provider]) => ({
      id,
      provider,
      load: this.requestCounts.get(id) || 0
    })).sort((a, b) => a.load - b.load);

    const selected = providersByLoad[0];
    this.requestCounts.set(selected.id, (this.requestCounts.get(selected.id) || 0) + 1);

    console.log('Selected provider:', {
      id: selected.id,
      currentLoad: selected.load,
      totalProviders: eligibleProviders.length
    });

    return { id: selected.id, provider: selected.provider };
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
        const currentCount = this.requestCounts.get(providerInfo.id) || 1;
        this.requestCounts.set(providerInfo.id, currentCount - 1);
        reject(new Error('Request timeout after 5 minutes'));
      }, 300000);

      this.pendingRequests.set(requestId, { 
        resolve, 
        reject, 
        timeout,
        providerId: providerInfo.id
      });
      
      providerInfo.provider.ws.send(JSON.stringify({
        type: 'completion_request',
        requestId,
        ...requestData,
        temperature: requestData.temperature || 0.7,
        max_tokens: requestData.max_tokens || 4096
      }));
    });
  }

  handleCompletionResponse(requestId, response) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest) {
      // Decrease request count when request completes
      if (pendingRequest.providerId) {
        const currentCount = this.requestCounts.get(pendingRequest.providerId) || 1;
        this.requestCounts.set(pendingRequest.providerId, currentCount - 1);
      }
      
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
          // Reset request count for inactive providers
          this.requestCounts.set(id, 0);
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
        hasWebSocket: !!provider.ws,
        currentLoad: this.requestCounts.get(id) || 0
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