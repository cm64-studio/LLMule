// config/tokenomics.js
const tokenConfig = {
    // Basic MULE configuration
    MULE: {
      decimals: 6, // Allow up to 6 decimal places like BTC
      welcome_amount: 1.0, // 1 MULE for new users
    },
    
    // System fees
    fees: {
      platform_fee: 0.10, // 10% platform fee
    },
    
    // Token conversion rates (tokens per 1 MULE)
    conversion_rates: {
      small: 1_000_000,    // 1M tokens
      medium: 500_000,     // 500k tokens (2x cost)
      large: 250_000,      // 250k tokens (4x cost)
      xl: 125_000          // 125k tokens (8x cost)
    },
  
    // Model type definitions
    model_types: {
      llm: {
        input: ['text'],
        output: ['text'],
        metric: 'tokens'
      },
      image: {
        input: ['text', 'image'],
        output: ['image'],
        metric: 'images'
      },
      whisper: {
        input: ['audio'],
        output: ['text'],
        metric: 'seconds'
      },
      multimodal: {
        input: ['text', 'image'],
        output: ['text'],
        metric: 'tokens'
      }
    }
  };
  
  // Helper functions for token calculations
  class TokenCalculator {
    static mulesToTokens(mules, tier) {
      return mules * tokenConfig.conversion_rates[tier];
    }
    
    static tokensToMules(tokens, tier) {
      return tokens / tokenConfig.conversion_rates[tier];
    }
    
    static calculateProviderEarnings(tokens, tier) {
      const mules = this.tokensToMules(tokens, tier);
      return mules * (1 - tokenConfig.fees.platform_fee);
    }
    
    static formatMules(amount) {
      return Number(amount.toFixed(tokenConfig.MULE.decimals));
    }
  }
  
  module.exports = { tokenConfig, TokenCalculator };