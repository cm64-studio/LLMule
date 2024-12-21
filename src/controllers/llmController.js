// src/controllers/llmController.js
const { providerManager } = require('../services/providerManager');

const handleLLMRequest = async (req, res) => {
  try {
    console.log('\n=== Processing Chat Completion Request ===');
    console.log('Request body:', {
      model: req.body.model,
      messageCount: req.body.messages?.length,
      temperature: req.body.temperature,
      max_tokens: req.body.max_tokens
    });

    // Validate required fields
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({
        error: {
          message: "messages is required and must be an array",
          type: "invalid_request_error",
          param: "messages",
          code: "invalid_messages"
        }
      });
    }

    // Map the full model name to a shorter version for compatibility
    const modelMap = {
      "TheBloke/OpenHermes-2.5-Mistral-7B-GGUF/openhermes-2.5-mistral-7b.Q2_K.gguf": "mistral-7b-openhermes",
      // Add other model mappings here
    };

    // Format request for provider
    const requestData = {
      model: req.body.model || 'tinyllama',
      messages: req.body.messages,
      temperature: parseFloat(req.body.temperature) || 0.7,
      max_tokens: parseInt(req.body.max_tokens) || 4096,
      stream: false 
    };

    console.log('Routing request to provider...');
    const response = await providerManager.routeRequest(requestData);
    
    // Log the response we got from the provider
    console.log('Response from provider:', JSON.stringify(response, null, 2));

    // If we got an error object in the response, handle it
    if (response.error) {
      return res.status(500).json({
        error: {
          message: response.error,
          type: "server_error",
          code: "provider_error"
        }
      });
    }

    // Validate and format the response to match OpenAI exactly
    const formattedResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelMap[requestData.model] || requestData.model,
      system_fingerprint: `fp_${Math.floor(Math.random() * 100000)}`,
      choices: response.choices?.map(choice => ({
        index: choice.index || 0,
        message: {
          role: choice.message?.role || 'assistant',
          content: choice.message?.content || ''
        },
        finish_reason: choice.finish_reason || 'stop'
      })) || [],
      usage: response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    // Log what we're sending back
    console.log('Sending formatted response:', JSON.stringify(formattedResponse, null, 2));
    
    // Set content-type header explicitly
    res.setHeader('Content-Type', 'application/json');
    res.json(formattedResponse);

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to process request',
        type: "server_error",
        code: "internal_error"
      }
    });
  }
};

module.exports = { handleLLMRequest };