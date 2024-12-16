# LLMule Server
*Democratizing AI through decentralized LLM sharing*

## Overview
LLMule Server is the central component of the LLMule network, a peer-to-peer system that enables individuals to share their local LLM resources. It handles provider registration, request routing, and network orchestration.

## Features
- Real-time WebSocket communication
- Automated provider discovery and health monitoring
- Smart request routing based on model tiers
- API key authentication
- Basic analytics and monitoring

## Model Tiers
| Tier | Category | Example Models | Min Requirements |
|------|-----------|---------------|------------------|
| 1 | Tiny (3B) | TinyLlama | 4GB RAM |
| 2 | Small (7B) | Mistral 7B | 8GB RAM |
| 3 | Medium (14B) | Microsoft Phi-4 | 16GB RAM |

## Requirements
- Node.js 20+
- MongoDB
- Redis (optional, for caching)

## Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/llmule-server.git
cd llmule-server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start server
npm start
```

## Environment Variables
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/llmule
JWT_SECRET=your-secret-key
WEBSOCKET_PATH=/llm-network
```

## API Endpoints

### REST API
```
POST /v1/chat/completions    # LLM inference requests
GET  /health                # Server health check
GET  /debug/providers       # List active providers (dev only)
GET  /debug/status         # Server status (dev only)
```

### WebSocket Events
```javascript
// Provider -> Server
{
  type: 'register',
  models: ['model1', 'model2'],
  apiKey: 'provider-api-key'
}

// Server -> Provider
{
  type: 'completion_request',
  requestId: 'uuid',
  model: 'model-name',
  messages: []
}
```

## Development Setup

### Local Development
```bash
# Install development dependencies
npm install --include=dev

# Run in development mode
npm run dev

# Run tests
npm test
```

### Docker Setup
```bash
# Build image
docker build -t llmule-server .

# Run container
docker run -p 3000:3000 llmule-server
```

## Server Architecture
```
src/
├── server.js           # Main entry point
├── config/            # Configuration
├── controllers/       # Request handlers
├── middleware/        # Auth, validation
├── services/         # Business logic
└── utils/            # Helper functions
```

## Monitoring
- Health endpoint: `/health`
- Provider metrics: `/debug/providers`
- Server status: `/debug/status`

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your branch
5. Create a pull request

## Beta Access
Currently in closed beta. Join waitlist at [llmule.cm64.studio].

## Security
- All connections use TLS/SSL
- API key required for access
- Rate limiting per key
- Provider verification
- Regular security audits

## Deployment
Recommended specs for production:
- 2+ CPU cores
- 4GB+ RAM
- 20GB SSD
- 100Mbps network

## License
MIT License - see LICENSE file

## Contact
- Issues: GitHub issue tracker
- Email: [andres@cm64.studio]

## Acknowledgments
Special thanks to:
- Ollama team
- Mistral AI
- Microsoft Research (Phi-4)
- All early beta testers

---
Made with ❤️ by the LLMule community