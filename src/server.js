// src/server.js
const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const config = require('./config');
const { authenticateApiKey } = require('./middleware/auth');
const { handleLLMRequest } = require('./controllers/llmController');
const authRoutes = require('./routes/auth'); // Add this line
const { providerManager } = require('./services/providerManager');
const { handleModelsList } = require('./controllers/modelController');
const { getBalance } = require('./controllers/balanceController');
const balanceRoutes = require('./routes/balanceRoutes');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: config.websocket_path });

global.providerManager = providerManager;
// MongoDB Connection
mongoose.connect(config.mongodb_uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Simple CORS configuration for API
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Make providerManager available to routes
app.locals.providerManager = providerManager;

// Add auth routes
app.use('/auth', authRoutes); // Add this line



// API Routes
app.post('/v1/chat/completions', authenticateApiKey, handleLLMRequest);

app.get('/v1/models', authenticateApiKey, handleModelsList);

app.use('/v1', balanceRoutes);

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

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    mongodb: mongoStatus,
    timestamp: new Date().toISOString(),
    providersCount: providerManager.providers.size
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  const providerId = uuidv4();
  console.log(`New provider connected: ${providerId}`);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleProviderMessage(ws, providerId, data);
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`Provider disconnected: ${providerId}`);
    providerManager.removeProvider(providerId);
  });
});

async function handleProviderMessage(ws, providerId, data) {
  console.log(`Received message from provider ${providerId}:`, data.type);
  
  try {
    switch (data.type) {
      case 'register':
        if (!data.models || data.models.length === 0 || !data.apiKey) {
          console.error('Invalid provider registration data');
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid registration data. Required: models and apiKey'
          }));
          return;
        }

        const success = await providerManager.registerProvider(providerId, {
          models: data.models,
          ws,
          apiKey: data.apiKey
        });

        if (!success) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Registration failed. Invalid API key or inactive user'
          }));
          ws.close();
          return;
        }

        ws.send(JSON.stringify({
          type: 'registered',
          message: 'Successfully registered as provider'
        }));
        break;
        
      case 'pong':
        providerManager.updateProviderStatus(providerId, 'active');
        break;
        
      case 'completion_response':
        providerManager.handleCompletionResponse(data.requestId, data.response);
        break;

      default:
        console.warn(`Unknown message type: ${data.type}`);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type'
        }));
    }
  } catch (error) {
    console.error('Error in handleProviderMessage:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Internal server error'
    }));
  }
}

// Start server
const PORT = config.port || 3000;
const HOST = '0.0.0.0'; // Esto hace que escuche en todas las interfaces

server.listen(PORT, HOST, () => {
  console.log(`\n=== LLMule Server Started ===`);
  console.log(`🚀 Server running on:`);
  console.log(`   - Local:    http://localhost:${PORT}`);
  console.log(`   - Network:  http://${getLocalIP()}:${PORT}`);
  console.log(`\n🔌 WebSocket server path: ${config.websocket_path}`);
  console.log(`📦 MongoDB connected`);
});

// Función helper para obtener IP local
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}


// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  mongoose.connection.close();
  server.close();
  process.exit(0);
});

module.exports = { app, server };