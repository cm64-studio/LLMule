// src/server.js
const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { authenticateApiKey } = require('./middleware/auth');
const { handleLLMRequest } = require('./controllers/llmController');
const { providerManager } = require('./services/providerManager');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: config.websocket_path });

// Middleware
app.use(express.json());

// Make providerManager available to routes
app.locals.providerManager = providerManager;

// API Routes
app.post('/v1/chat/completions', authenticateApiKey, handleLLMRequest);

// Add this route in your server.js, replacing the existing debug endpoint:

app.get('/debug/providers', (req, res) => {
  try {
    const providersInfo = app.locals.providerManager.getProvidersInfo();
    res.json({
      total: providersInfo.length,
      providers: providersInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get providers info',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get('/debug/load-balancing', (req, res) => {
  const stats = app.locals.providerManager.getLoadBalancingStats();
  res.json({
    stats,
    timestamp: new Date().toISOString()
  });
});

app.get('/debug/status', (req, res) => {
  const manager = app.locals.providerManager;
  res.json({
    providers: {
      total: manager.providers.size,
      active: Array.from(manager.providers.values()).filter(p => p.status === 'active').length
    },
    pendingRequests: manager.pendingRequests.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Add a health check endpoint for good measure
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providersCount: providerManager.providers.size
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  const providerId = uuidv4();
  console.log(`New provider connected: ${providerId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleProviderMessage(ws, providerId, data);
    } catch (error) {
      console.error('Invalid message format:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Provider disconnected: ${providerId}`);
    providerManager.removeProvider(providerId);
  });
});

function handleProviderMessage(ws, providerId, data) {
  console.log(`Received message from provider ${providerId}:`, data.type);
  
  switch (data.type) {
    case 'register':
      if (!data.models || data.models.length === 0) {
        console.error('Provider tried to register with no models');
        return;
      }

      providerManager.registerProvider(providerId, {
        models: data.models,
        ws,
        status: 'active'
      });
      break;
      
    case 'pong':
      providerManager.updateProviderStatus(providerId, 'active');
      break;
      
    case 'completion_response':
      providerManager.handleCompletionResponse(data.requestId, data.response);
      break;
  }
}

// Start server
const PORT = config.port || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server path: ${config.websocket_path}`);
});

module.exports = { app, server };