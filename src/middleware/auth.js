// src/middleware/auth.js
const User = require('../models/userModel');

const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from headers - support both x-api-key and Authorization: Bearer
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.startsWith('Bearer ') ? 
                   authHeader.substring(7) : 
                   req.headers['x-api-key'];

    console.log('Auth debug:', {
      headers: req.headers,
      authHeader,
      extractedApiKey: apiKey
    });

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

    console.log('Auth user lookup result:', {
      apiKeyProvided: apiKey,
      userFound: !!user,
      userId: user?._id?.toString(),
      userStatus: user?.status,
      emailVerified: user?.emailVerified
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