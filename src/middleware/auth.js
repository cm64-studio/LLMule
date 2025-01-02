// src/middleware/auth.js
const User = require('../models/userModel');

const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || 
                  (req.headers.authorization?.startsWith('Bearer ') ? 
                   req.headers.authorization.substring(7) : null);

    // console.log('Auth debug:', {
    //   headers: req.headers,
    //   extractedApiKey: apiKey ? `${apiKey.substring(0, 10)}...` : null,
    //   authMethod: req.headers['x-api-key'] ? 'x-api-key' : 
    //              req.headers.authorization ? 'bearer' : 'none'
    // });

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