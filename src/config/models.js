// src/config/models.js
const modelConfig = {
    tiers: {
      SMALL: 'small',
      MEDIUM: 'medium',
      LARGE: 'large',
      XL: 'xl'
    },
  
    models: {
      // Small Models (7B and under)
      'tinyllama': {
        tier: 'small',
        context: 4096,
        requirements: {
          ram: '4GB',
          gpu: false
        }
      },
      'phi-2': {
        tier: 'small',
        context: 2048,
        requirements: {
          ram: '4GB',
          gpu: false
        }
      },
      'phi3:mini': {
        tier: 'small',
        context: 2048,
        requirements: {
          ram: '4GB',
          gpu: false
        }
      },
  
      // Medium Models (7B-13B)
      'mistral-7b': {
        tier: 'medium',
        context: 8192,
        requirements: {
          ram: '8GB',
          gpu: '8GB VRAM'
        }
      },
      'openchat-7b': {
        tier: 'medium',
        context: 8192,
        requirements: {
          ram: '8GB',
          gpu: '8GB VRAM'
        }
      },
  
      // Large Models (14B-30B)
      'mixtral-8x7b': {
        tier: 'large',
        context: 32768,
        requirements: {
          ram: '16GB',
          gpu: '16GB VRAM'
        }
      },
      'vanilj/Phi-4:latest': {
        tier: 'large',
        context: 16384,
        requirements: {
          ram: '16GB',
          gpu: '16GB VRAM'
        }
      },
  
      // XL Models (30B+)
      'llama2-70b': {
        tier: 'xl',
        context: 4096,
        requirements: {
          ram: '32GB',
          gpu: '32GB VRAM'
        }
      }
    },
  
    // Model name aliases and normalizations
    aliases: {
      'mistral': 'mistral-7b',
      'mixtral': 'mixtral-8x7b',
      'tiny': 'tinyllama'
    }
  };
  
  class ModelManager {
    static getModelInfo(modelName) {
        // Handle common patterns
        if (modelName.toLowerCase().includes('mistral') || 
            modelName.toLowerCase().includes('openhermes')) {
          return {
            tier: 'medium',
            context: 8192,
            requirements: {
              ram: '8GB',
              gpu: '8GB VRAM'
            }
          };
        }
        
        // Try direct match
        const normalizedName = modelConfig.aliases[modelName.toLowerCase()] || modelName;
        return modelConfig.models[normalizedName];
    }
  
    static getTierModels(tier) {
      return Object.entries(modelConfig.models)
        .filter(([_, info]) => info.tier === tier)
        .map(([name]) => name);
    }
  
    static validateModel(modelName) {
      return this.getModelInfo(modelName) !== undefined;
    }
  
    static getRandomModelForTier(tier) {
      const models = this.getTierModels(tier);
      return models[Math.floor(Math.random() * models.length)];
    }
  }
  
  module.exports = { modelConfig, ModelManager };