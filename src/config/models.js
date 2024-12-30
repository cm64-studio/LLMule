// src/config/models.js
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
      /phi-v2/i,         // Phi variants
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
      '3': 'medium',
      '4': 'large'
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
  static _normalizeModelName(modelName) {
    // Handle cases where modelName is null/undefined
    if (!modelName) return '';
    
    // Convert to string and lowercase
    const name = modelName.toString().toLowerCase();
    
    // Remove version tags for pattern matching
    return name.split(':')[0]   // Handle :latest, :v1, etc
              .split('@')[0]    // Handle @version
              .split('/')[1] || name; // Handle namespace/model
  }
  
  static getModelInfo(modelName) {
    console.log('Getting model info for:', modelName);
    
    // Normalize the model name first
    const normalizedName = this._normalizeModelName(modelName);
    
    if (!normalizedName) {
      console.warn('Invalid model name:', modelName);
      return this.createModelInfo('medium');
    }
  
    // Handle phi models specially
    if (normalizedName.includes('phi')) {
      const version = normalizedName.match(/\d+/)?.[0];
      if (version) {
        switch (version) {
          case '1':
          case '2': return this.createModelInfo('small');
          case '3': return this.createModelInfo('medium');
          case '4': return this.createModelInfo('large');
          default: return this.createModelInfo('medium');
        }
      }
    }
  
    // Try pattern matching for size
    for (const [tier, patterns] of Object.entries(modelConfig.sizePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          return this.createModelInfo(tier);
        }
      }
    }
  
    // Check model families
    for (const [family, config] of Object.entries(modelConfig.modelFamilies)) {
      if (normalizedName.includes(family)) {
        if (typeof config === 'string') {
          return this.createModelInfo(config);
        } else {
          // For families with version-specific tiers
          const version = normalizedName.match(/\d+b?/)?.[0];
          return this.createModelInfo(config[version] || 'medium');
        }
      }
    }
  
    console.warn(`Unrecognized model pattern: ${modelName}, defaulting to medium`);
    return this.createModelInfo('medium');
  }

  // Changed to static method and renamed without underscore
  static createModelInfo(tier) {
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
      context: contexts[tier] || 8192,
      requirements: requirements[tier] || requirements.medium,
      type: 'llm'
    };
  }
}

module.exports = { modelConfig, ModelManager };