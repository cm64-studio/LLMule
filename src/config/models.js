const modelConfig = {
  tiers: {
    SMALL: 'small',   // Up to 3B params
    MEDIUM: 'medium', // 3B to 13B params
    LARGE: 'large',   // 13B to 30B params
    XL: 'xl'         // 30B+ params
  },

  // Model size patterns for classification
  sizePatterns: {
    small: [
      /1\.?[0-9]?b/i,    // 1B, 1.3B etc
      /2\.?[0-9]?b/i,    // 2B variants
      /3\.?[0-9]?b/i,    // 3B variants
      /tiny/i,           // TinyLlama etc
      /small/i,          // Small variants
      /phi-2/i,          // Phi-2 specific
    ],
    medium: [
      /7\.?[0-9]?b/i,    // 7B variants (Mistral, Llama2 etc)
      /8\.?[0-9]?b/i,    // 8B variants
      /mistral-?7b/i,    // Specific Mistral mentions
      /13\.?[0-9]?b/i,   // 13B variants
      /vicuna-?13b/i,    // Specific Vicuna mentions
    ],
    large: [
      /14\.?[0-9]?b/i,   // 14B variants
      /20\.?[0-9]?b/i,   // 20B variants
      /mixtral/i,        // Mixtral-8x7B (equivalent to ~47B)
      /30\.?[0-9]?b/i,   // 30B variants
    ],
    xl: [
      /33\.?[0-9]?b/i,   // 33B variants
      /65\.?[0-9]?b/i,   // 65B variants
      /70\.?[0-9]?b/i,   // 70B variants (Llama2)
      /claude-?2/i,      // Claude-2 equivalent models
    ]
  },

  // Known model families for quick classification
  modelFamilies: {
    'phi': {
      '1': 'small',
      '2': 'small',
      '3': 'medium'
    },
    'mistral': 'medium',
    'mixtral': 'large',
    'llama2': {
      '7b': 'medium',
      '13b': 'medium',
      '70b': 'xl'
    },
    'openchat': 'medium',
    'vicuna': {
      '7b': 'medium',
      '13b': 'medium'
    }
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
    // First try exact match
    if (modelConfig.models[modelName]) {
      return modelConfig.models[modelName];
    }

    // Normalize the model name
    const normalizedName = modelName.toLowerCase();

    // Try to identify model family
    for (const [family, config] of Object.entries(modelConfig.modelFamilies)) {
      if (normalizedName.includes(family)) {
        // If family has specific versions
        if (typeof config === 'object') {
          for (const [version, tier] of Object.entries(config)) {
            if (normalizedName.includes(version)) {
              return this._createModelInfo(tier);
            }
          }
        } else {
          // Family has fixed tier
          return this._createModelInfo(config);
        }
      }
    }

    // Try pattern matching for size
    for (const [tier, patterns] of Object.entries(modelConfig.sizePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          return this._createModelInfo(tier);
        }
      }
    }

    // Default to medium if contains common LLM names
    if (normalizedName.includes('llm') || 
        normalizedName.includes('hermes') ||
        normalizedName.includes('neural')) {
      return this._createModelInfo('medium');
    }

    // Log unrecognized model for future pattern updates
    console.warn(`Unrecognized model pattern: ${modelName}`);
    return this._createModelInfo('medium'); // Safe default
  }

  static _createModelInfo(tier) {
    // Create standard model info based on tier
    const requirements = {
      small: { ram: '4GB', gpu: false },
      medium: { ram: '8GB', gpu: '8GB VRAM' },
      large: { ram: '16GB', gpu: '16GB VRAM' },
      xl: { ram: '32GB', gpu: '32GB VRAM' }
    };

    const contexts = {
      small: 4096,
      medium: 8192,
      large: 32768,
      xl: 32768
    };

    return {
      tier,
      context: contexts[tier],
      requirements: requirements[tier]
    };
  }

  // Keep existing utility methods...
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