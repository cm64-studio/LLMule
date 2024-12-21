// src/middleware/rateLimiter.js
const User = require('../models/userModel');

const rateLimiter = async (req, res, next) => {
  try {
    const user = await User.findOne({ apiKey: req.user.apiKey });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Check if rate limit period has reset
    if (user.rateLimits.reset < new Date()) {
      user.rateLimits.requests = user.rateLimits.reset.getTime();
      user.rateLimits.reset = new Date(new Date().setMonth(new Date().getMonth() + 1));
      await user.save();
    }

    // Check rate limit
    if (user.rateLimits.requests <= 0) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        reset: user.rateLimits.reset
      });
    }

    // Decrease available requests
    user.rateLimits.requests--;
    await user.save();
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Rate limit check failed' });
  }
};

module.exports = rateLimiter;