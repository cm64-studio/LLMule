// src/server.js
const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const config = require('./config');
const { authenticateApiKey, authenticateAdmin } = require('./middleware/auth');
const { handleLLMRequest } = require('./controllers/llmController');
const authRoutes = require('./routes/auth');
const { providerManager } = require('./services/providerManager');
const { handleModelsList } = require('./controllers/modelController');
const DebugController = require('./controllers/debugController');
const logger = require('./utils/logger');
const requestLoggerMiddleware = require('./middleware/requestLogger');

const balanceRoutes = require('./routes/balanceRoutes');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: config.websocket_path });

global.providerManager = providerManager;

// MongoDB Connection
mongoose.connect(config.mongodb_uri)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => {
    logger.error('MongoDB connection error:', { error: err.message, stack: err.stack });
    process.exit(1);
  });

// Simple CORS configuration for API
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLoggerMiddleware);

// Make providerManager available to routes
app.locals.providerManager = providerManager;

// Add auth routes
app.use('/auth', authRoutes);

// API Routes
app.post('/v1/chat/completions', authenticateApiKey, handleLLMRequest);
app.get('/v1/models', authenticateApiKey, handleModelsList);
app.use('/v1', balanceRoutes);

// Debug routes
app.get('/debug/users', authenticateAdmin, async (req, res) => {
  try {
    const stats = await DebugController.getUserStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get user stats', { 
      error: error.message, 
      stack: error.stack,
      requestId: req.requestId 
    });
    res.status(500).json({
      error: 'Failed to get user stats',
      message: error.message
    });
  }
});

app.get('/debug/providers', authenticateAdmin, (req, res) => {
  try {
    const providersInfo = app.locals.providerManager.getProvidersInfo();
    res.json({
      total: providersInfo.length,
      providers: providersInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get providers info', { 
      error: error.message, 
      stack: error.stack,
      requestId: req.requestId 
    });
    res.status(500).json({
      error: 'Failed to get providers info',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get('/debug/load-balancing', authenticateAdmin, (req, res) => {
  const stats = app.locals.providerManager.getLoadBalancingStats();
  res.json({
    stats,
    timestamp: new Date().toISOString()
  });
});

app.get('/debug/status', authenticateAdmin, (req, res) => {
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

// WebSocket message handler
async function handleProviderMessage(ws, providerId, data) {
  logger.debug('Processing provider message', {
    providerId,
    messageType: data.type
  });
  
  try {
    switch (data.type) {
      case 'register':
        if (!data.models || data.models.length === 0 || !data.apiKey) {
          logger.warn('Invalid provider registration data', {
            providerId,
            hasModels: !!data.models,
            modelCount: data.models?.length,
            hasApiKey: !!data.apiKey
          });
          
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid registration data. Required: models and apiKey'
          }));
          return;
        }

        const registrationData = {
          models: data.models,
          ws,
          apiKey: data.apiKey
        };

        if (data.userId) {
          logger.info('Including userId in registration', {
            providerId,
            userId: data.userId
          });
          registrationData.userId = data.userId;
        }

        const success = await providerManager.registerProvider(providerId, registrationData);

        if (!success) {
          logger.error('Provider registration failed', { providerId });
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Registration failed. Invalid API key or inactive user'
          }));
          ws.close();
          return;
        }

        logger.info('Provider registered successfully', { providerId });
        ws.send(JSON.stringify({
          type: 'registered',
          message: 'Successfully registered as provider'
        }));
        break;
        
      case 'pong':
        providerManager.updateProviderStatus(providerId, 'active');
        break;
        
      case 'completion_response':
        logger.debug('Handling completion response', { 
          providerId,
          requestId: data.requestId 
        });
        providerManager.handleCompletionResponse(data.requestId, data.response);
        break;

      default:
        logger.warn('Unknown message type received', {
          providerId,
          type: data.type
        });
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type'
        }));
    }
  } catch (error) {
    logger.error('Error in handleProviderMessage', {
      providerId,
      error: error.message,
      stack: error.stack
    });
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Internal server error'
    }));
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  const providerId = uuidv4();
  logger.info('New provider connected', { providerId });
  
  // Setup early connection tracking
  ws.isAlive = true;
  ws.lastPong = Date.now();
  
  // Store initial provider state
  providerManager.providers.set(providerId, {
    ws,
    status: 'connecting',
    readyForRequests: false,
    lastHeartbeat: Date.now(),
    models: [] // Will be populated on registration
  });
  
  ws.on('message', async (message) => {
    logger.debug('WebSocket Message received', { 
      providerId,
      messageType: 'incoming'
    });

    try {
      let data = JSON.parse(message);
      logger.info('Processing WebSocket message', {
        providerId,
        type: data.type
      });
      
      if (data.type === 'register') {
        logger.debug('Processing registration', {
          providerId,
          hasModels: !!data.models,
          modelCount: data.models?.length
        });
        data.ws = ws;
      }
      
      await handleProviderMessage(ws, providerId, data);
    } catch (error) {
      logger.error('WebSocket message handling error', {
        providerId,
        error: error.message,
        stack: error.stack
      });
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('Provider disconnected', { providerId });
    providerManager.removeProvider(providerId);
  });

  ws.on('pong', () => {
    logger.debug('Received pong', { providerId });
    ws.isAlive = true;
    ws.lastPong = Date.now();
    providerManager.updateProviderStatus(providerId, 'active');
  });

  ws.on('ping', () => {
    try {
      ws.pong();
    } catch (error) {
      logger.error('Error sending pong', {
        providerId,
        error: error.message,
        stack: error.stack
      });
    }
  });
});

// Start server
const PORT = config.port || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info('Server started', {
    port: PORT,
    host: HOST,
    websocketPath: config.websocket_path,
    environment: process.env.NODE_ENV
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Performing graceful shutdown...');
  mongoose.connection.close();
  server.close();
  process.exit(0);
});

module.exports = { app, server };