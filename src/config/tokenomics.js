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
      if (typeof mules !== 'number' || isNaN(mules) || mules < 0) {
          console.error('Invalid mules value:', mules);
          return 0;
      }
      const rate = tokenConfig.conversion_rates[tier];
      if (!rate) {
          console.error('Invalid tier:', tier);
          return 0;
      }
      return Math.floor(mules * rate); // Ensure integer result
    }
    
    static tokensToMules(tokens, tier) {
      if (typeof tokens !== 'number' || isNaN(tokens) || tokens < 0) {
          console.error('Invalid tokens value:', tokens);
          return 0;
      }
      const rate = tokenConfig.conversion_rates[tier];
      if (!rate) {
          console.error('Invalid tier:', tier);
          return 0;
      }
      return parseFloat((tokens / rate).toFixed(6)); // 6 decimal precision
    }
    
    static calculateProviderEarnings(tokens, tier) {
      const mules = this.tokensToMules(tokens, tier);
      return mules * (1 - tokenConfig.fees.platform_fee);
    }
    
    static formatMules(amount) {
      if (typeof amount !== 'number' || isNaN(amount)) {
          console.error('Invalid amount to format:', amount);
          return 0;
      }
      return parseFloat(amount.toFixed(tokenConfig.MULE.decimals));
    }
  }
  
  module.exports = { tokenConfig, TokenCalculator };