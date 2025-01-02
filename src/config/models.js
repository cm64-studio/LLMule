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
      /phi-?2/i,         // Phi-2 specific
      /phi-?v2/i,        // Phi variants
      /phi3?:?mini/i,    // Phi3 mini variant - Fixed pattern
      /:?mini/i,         // Other mini variants
      /phi-?1/i,         // Phi-1
    ],
    medium: [
      /7\.?[0-9]?b/i,    // 7B variants (Mistral, Llama2 etc)
      /mistral/i,        // Mistral variants
      /openhermes/i,     // OpenHermes (usually 7B)
      /8\.?[0-9]?b/i,    // 8B variants
      /13\.?[0-9]?b/i,   // 13B variants
      /phi-?3(?!:?mini)/i, // Phi-3 but not phi3:mini
    ],
    large: [
      /phi-?4/i,         // Phi-4 model
      /mixtral/i,        // Mixtral models
      /14\.?[0-9]?b/i,   // 14B variants
      /20\.?[0-9]?b/i,   // 20B variants
      /30\.?[0-9]?b/i,   // 30B variants
    ],
    xl: [
      /65\.?[0-9]?b/i,   // 65B variants
      /70\.?[0-9]?b/i,   // 70B variants
    ]
  },

  // Known model families for quick classification
  modelFamilies: {
    'phi': {
      '1': 'small',
      '2': 'small',
      '3': {
        'mini': 'small',  // Added specific entry for phi3:mini
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
    if (!modelName) return this.createModelInfo('medium');
    
    console.log('Getting model info for:', modelName);
  
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

  // Add this method to the ModelManager class in src/config/models.js

  static validateModel(modelName) {
    if (!modelName) return false;

    // Normalize model name
    //const normalizedName = this._normalizeModelName(modelName);

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