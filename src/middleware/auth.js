// src/middleware/auth.js
const User = require('../models/user');

const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from headers - support both x-api-key and Authorization: Bearer
    let apiKey = req.headers['x-api-key'];
    
    // Check Authorization header (OpenAI style)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7); // Remove 'Bearer ' prefix
    }

    if (!apiKey) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'API key is required. Provide it via x-api-key header or Authorization: Bearer YOUR_API_KEY'
      });
    }

    // Find user with this API key
    const user = await User.findOne({ 
      apiKey,
      emailVerified: true,
      status: 'active'
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    // Add user to request object for use in later middleware
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

module.exports = { authenticateApiKey };