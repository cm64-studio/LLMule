// src/middleware/auth.js
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
  
    // TODO: Implement proper API key validation
    // For testing, accept any API key
    req.user = { apiKey };
    next();
  };
  
  module.exports = { authenticateApiKey };