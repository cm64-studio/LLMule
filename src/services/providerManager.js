// src/services/providerManager.js
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
    console.log('\n=== Handling Completion Response ===');
    console.log('Request ID:', requestId);
    console.log('Response:', JSON.stringify(response, null, 2));

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.error('No pending request found for ID:', requestId);
      return;
    }

    try {
      // Cleanup
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(requestId);

      // Update request count
      if (pendingRequest.providerId) {
        const currentCount = this.requestCounts.get(pendingRequest.providerId) || 1;
        this.requestCounts.set(pendingRequest.providerId, currentCount - 1);
      }

      // Handle error responses
      if (response.error) {
        console.error('Error in provider response:', response.error);
        pendingRequest.reject(new Error(response.error));
        return;
      }

      // Validate response structure
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
    const { ModelManager } = require('../config/models');
    
    console.log('\n=== Current Providers State ===');
    console.log('Total providers:', this.providers.size);
    
    for (const [id, provider] of this.providers) {
      const modelDetails = provider.models.map(model => {
        const info = ModelManager.getModelInfo(model) || {
          tier: model.toLowerCase().includes('mistral') ? 'medium' : 'unknown',
          requirements: model.toLowerCase().includes('mistral') ? {
            ram: '8GB',
            gpu: '8GB VRAM'
          } : {}
        };
        
        return {
          name: model,
          tier: info.tier,
          requirements: info.requirements
        };
      });
  
      console.log(`- Provider ${id}:`, {
        status: provider.status,
        models: modelDetails,
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