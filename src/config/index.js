// src/config/index.js
require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  jwt_secret: process.env.JWT_SECRET || 'your-secret-key',
  default_rate_limit: process.env.RATE_LIMIT || 100,
  websocket_path: '/llm-network'
};

module.exports = config;