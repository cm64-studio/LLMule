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
      /\b[1-3]\.?[0-9]?b\b/i,  // 1-3B models
      /tiny|mini|small/i,       // Small variants
      /\b\d{1,3}m\b/i,         // Models in millions (135m etc)
      /phi-?[12]/i,            // Phi-1, Phi-2
    ],
    medium: [
      /\b[4-9]\.?[0-9]?b\b/i,  // 4-9B models
      /\b1[0-2]\.?[0-9]?b\b/i, // 10-12B models
      /mistral-?7b/i,
      /llama-?[23]-?7b/i,
    ],
    large: [
      /\b1[3-9]\.?[0-9]?b\b/i, // 13-19B models
      /\b2[0-9]\.?[0-9]?b\b/i, // 20-29B models
      /mixtral/i,
      /phi-?4/i,
      /qwen.*14b/i,
    ],
    xl: [
      /\b[3-9][0-9]\.?[0-9]?b\b/i, // 30B+ models
      /llama-?2-?70b/i,
    ]
  },

  // Known model families for quick classification
  modelFamilies: {
    'phi': {
      '1': 'small',
      '2': 'small',
      '3': {
        'mini': 'small',
        'default': 'medium'
      },
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
    'openhermes': 'medium', // Add explicit entry
    'hermes': 'medium',     // For variants
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
    },
    
  },

  knownModels: {
    'phi3:mini': 'small',
    'phi-3:mini': 'small',
    'phi3-mini': 'small'
  },

  // Model name aliases and normalizations
  aliases: {
    'mistral': 'mistral-7b',
    'mixtral': 'mixtral-8x7b',
    'tiny': 'tinyllama'
  },

  modelTypes: {
    mistral: /mistral|mistal/i,
    llama: /llama|alpaca/i,
    phi: /phi/i,
    qwen: /qwen/i,
    mixtral: /mixtral/i,
    hermes: /hermes/i,
    openchat: /openchat/i,
  }
};

class ModelManager {
  // static _normalizeModelName(modelName) {
  //   // Handle direct tier requests
  //   if (['small', 'medium', 'large', 'xl'].includes(modelName?.toLowerCase())) {
  //     return modelName.toLowerCase();
  //   }

  //   // Handle non-string or empty inputs
  //   if (!modelName) return '';

  //   // Convert to string and lowercase
  //   const name = modelName.toString().toLowerCase();

  //   // Handle various model name formats
  //   const cleanName = name
  //     .split(':')[0]         // Remove version tags
  //     .split('@')[0]         // Remove version numbers
  //     .split('/').pop() ||   // Get last part of path
  //     name;                  // Fallback to original

  //   return cleanName;
  // }

  static getModelInfo(modelName) {
    // Handle case when modelName is null or undefined
    if (!modelName) return this.createModelInfo('medium');

    // Handle case when modelName is an object (like from your examples)
    if (typeof modelName === 'object' && modelName !== null) {
      // Extract the name property if it exists
      modelName = modelName.name || modelName.id || '';
    }
    
    // Make sure modelName is a string at this point
    modelName = String(modelName);
    
    // Handle combined type|model requests
    if (modelName.includes('|')) {
      const [tierOrType, model] = modelName.split('|');
      return this._handleCombinedRequest(tierOrType, model);
    }
    
    //console.log('Getting model info for:', modelName);
  
    // Direct tier request
    if (['small', 'medium', 'large', 'xl'].includes(modelName.toLowerCase())) {
      console.log('Direct tier request:', modelName);
      return this.createModelInfo(modelName.toLowerCase());
    }
  
    // Check for mini variants first (they're always small)
    if (modelName.toLowerCase().includes('mini')) {
      console.log('Mini model detected:', modelName);
      return this.createModelInfo('small');
    }
  
    // Check known model families
    const family = modelName.toLowerCase().split(/[-:\/]/)[0];
    if (modelConfig.modelFamilies[family]) {
      if (typeof modelConfig.modelFamilies[family] === 'string') {
        return this.createModelInfo(modelConfig.modelFamilies[family]);
      }
      // Handle nested configurations
      if (typeof modelConfig.modelFamilies[family] === 'object') {
        const variant = modelName.toLowerCase().split(/[-:\/]/)[1];
        if (variant && modelConfig.modelFamilies[family][variant]) {
          return this.createModelInfo(modelConfig.modelFamilies[family][variant]);
        }
      }
    }
  
    // Pattern matching for size/tier
    for (const [tier, patterns] of Object.entries(modelConfig.sizePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(modelName.toLowerCase())) {
          return this.createModelInfo(tier);
        }
      }
    }
  
    // Default to medium if no match found
    console.warn(`Model size not determined for: ${modelName}, defaulting to medium`);
    return this.createModelInfo('medium');
  }

  static _handleCombinedRequest(tierOrType, model) {
    // Check if first part is a tier
    if (['small', 'medium', 'large', 'xl'].includes(tierOrType.toLowerCase())) {
      const modelInfo = this.getModelInfo(model);
      return modelInfo.tier === tierOrType.toLowerCase() ? modelInfo : null;
    }

    // Check if it's a model type filter
    const typePattern = modelConfig.modelTypes[tierOrType.toLowerCase()];
    if (typePattern && typePattern.test(model)) {
      return this.getModelInfo(model);
    }

    return null;
  }

  // Add this method to the ModelManager class in src/config/models.js

  static validateModel(modelName) {
    if (!modelName) return false;

    // Handle case when modelName is an object
    if (typeof modelName === 'object' && modelName !== null) {
      modelName = modelName.name || modelName.id || '';
    }
    
    // Ensure modelName is a string
    modelName = String(modelName);

    // Direct tier requests are valid
    if (['small', 'medium', 'large', 'xl'].includes(modelName)) {
      return true;
    }

    // Check if model exists in known models
    if (modelConfig.models[modelName]) {
      return true;
    }

    // Check against size patterns
    for (const [tier, patterns] of Object.entries(modelConfig.sizePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(modelName)) {
          return true;
        }
      }
    }

    // Check against model families
    const [family, variant] = modelName.split(/[-/]/);
    if (modelConfig.modelFamilies[family]) {
      if (typeof modelConfig.modelFamilies[family] === 'string') {
        return true;
      }
      if (variant && modelConfig.modelFamilies[family][variant]) {
        return true;
      }
    }

    return false;
  }

  // Changed to static method and renamed without underscore
  static createModelInfo(tier) {
    return {
      tier,
      type: 'llm',
      context: {
        small: 4096,
        medium: 8192,
        large: 32768,
        xl: 32768
      }[tier] || 8192,
      requirements: {
        small: { ram: '4GB', gpu: false },
        medium: { ram: '8GB', gpu: '8GB VRAM' },
        large: { ram: '16GB', gpu: '16GB VRAM' },
        xl: { ram: '32GB', gpu: '32GB VRAM' }
      }[tier] || { ram: '8GB', gpu: '8GB VRAM' }
    };
  }
}

module.exports = { modelConfig, ModelManager };