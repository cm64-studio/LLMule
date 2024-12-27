// middleware/rateLimiter.js
const { TokenCalculator } = require('../config/tokenomics');
const TokenService = require('../services/tokenService');
const { ModelManager } = require('../config/models');

const rateLimiter = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Check rate limits
    if (user.rateLimits.reset < new Date()) {
      user.rateLimits.requests = user.rateLimits.limit;
      user.rateLimits.reset = new Date(new Date().setMonth(new Date().getMonth() + 1));
      await user.save();
    }

    if (user.rateLimits.requests <= 0) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded',
          code: 'rate_limit_exceeded',
          reset_at: user.rateLimits.reset,
          limit: user.rateLimits.limit
        }
      });
    }

    // Pre-check token allowance
    const model = req.body.model || 'small';
    const estimatedTokens = req.body.max_tokens || 4096;
    const modelInfo = ModelManager.getModelInfo(model);
    
    // Convert estimated tokens to MULE
    const estimatedMules = TokenCalculator.tokensToMules(
      estimatedTokens,
      modelInfo.tier
    );

    // Get user balance
    const balance = await TokenService.getBalance(user._id);
    
    if (balance.balance < estimatedMules) {
      return res.status(402).json({
        error: {
          message: 'Insufficient MULE balance',
          code: 'insufficient_balance',
          available_mules: balance.balance,
          required_mules: estimatedMules,
          available_tokens: TokenCalculator.mulesToTokens(
            balance.balance,
            modelInfo.tier
          )
        }
      });
    }

    // Decrease available requests
    user.rateLimits.requests--;
    await user.save();
    
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    res.status(500).json({
      error: {
        message: 'Rate limit check failed',
        code: 'rate_limit_error'
      }
    });
  }
};

module.exports = rateLimiter;