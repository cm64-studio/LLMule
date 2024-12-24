// src/middleware/rateLimiter.js
const User = require('../models/userModel');
const { TokenManager } = require('../services/TokenManager');

const rateLimiter = async (req, res, next) => {
  try {
    const user = await User.findOne({ apiKey: req.user.apiKey });
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'invalid_api_key'
      });
    }

    // Check rate limits
    if (user.rateLimits.reset < new Date()) {
      user.rateLimits.requests = user.rateLimits.limit;
      user.rateLimits.reset = new Date(new Date().setMonth(new Date().getMonth() + 1));
      await user.save();
    }

    if (user.rateLimits.requests <= 0) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'rate_limit_exceeded',
        reset: user.rateLimits.reset,
        limit: user.rateLimits.limit
      });
    }

    // Pre-check token allowance
    const estimatedTokens = req.body.max_tokens || 4096;
    const model = req.body.model || 'tinyllama';
    
    const allowance = await TokenManager.checkAllowance(
      user._id,
      model,
      estimatedTokens
    );

    if (!allowance.allowed) {
      return res.status(402).json({
        error: 'Insufficient token balance',
        code: 'insufficient_tokens',
        remaining: allowance.remaining,
        requested: estimatedTokens
      });
    }

    // Decrease available requests
    user.rateLimits.requests--;
    await user.save();
    
    // Add token info to request for later use
    req.tokenInfo = {
      userId: user._id,
      model,
      estimatedTokens
    };
    
    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    res.status(500).json({
      error: 'Rate limit check failed',
      code: 'rate_limit_error'
    });
  }
};

module.exports = rateLimiter;