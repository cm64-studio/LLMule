// src/controllers/llmController.js
const { providerManager } = require('../services/providerManager');


const handleLLMRequest = async (req, res) => {
  try {
    const response = await providerManager.routeRequest({
      model: req.body.model,
      messages: req.body.messages,
      temperature: req.body.temperature,
      max_tokens: req.body.max_tokens
    });
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      error: error.message || 'Failed to process request' 
    });
  }
};


module.exports = { handleLLMRequest };