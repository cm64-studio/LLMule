// src/config/index.js
require('dotenv').config();


const config = {
  port: process.env.PORT || 3000,
  mongodb_uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/llmule',
  jwt_secret: process.env.JWT_SECRET || 'your-secret-key',
  postmark_api_key: process.env.POSTMARK_API_KEY,
  from_email: process.env.FROM_EMAIL || 'llmule@cm64.studio',
  api_url: process.env.API_URL || 'http://localhost:3000',
  default_rate_limit: process.env.RATE_LIMIT || 1000,
  websocket_path: '/llm-network'
};

module.exports = config;