// src/middleware/auth.js
const authenticateApiKey = async (req, res, next) => {
    var apiKey = req.headers['x-api-key'] || req.headers['authorization'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    apiKey = apiKey.replace('Bearer ', '');
    if (apiKey === '11223344556677889900') {
        req.user = { apiKey };
        next();
    } else {
        return res.status(401).json({ error: 'Invalid API key' });
    }
  
    // // TODO: Implement proper API key validation
    // // For testing, accept any API key
    // req.user = { apiKey };
    // next();
  };
  
  module.exports = { authenticateApiKey };