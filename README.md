# LLMule 🦾

LLMule is a decentralized peer-to-peer network that democratizes access to AI by enabling individuals to share their computational resources and run AI models locally. Built on the principles of digital autonomy, fair value distribution, and collaborative innovation.

## 🌟 Features

- **Decentralized AI Network**: Run and share AI models in a P2P network
- **Multi-Model Support**: Compatible with Ollama, LM Studio, and EXO
- **Token Economics**: Fair value distribution with MULE tokens
- **Real-time Monitoring**: Track performance and earnings
- **Auto-Discovery**: Automatic node and model discovery
- **Load Balancing**: Smart request distribution

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB
- One of the following LLM services:
  - [Ollama](https://ollama.ai)
  - [LM Studio](https://lmstudio.ai)
  - [EXO](https://github.com/EXO-AI/ExoCode)

### Installation

```bash
# Clone the repository
git clone https://github.com/cm64-studio/LLMule.git

# Install dependencies
cd llmule
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start
```

## 🔧 Architecture

### Network Components

```
Client Request -> API Gateway -> Provider Manager -> Provider Node
                                      ↓
                            Load Balancing & Health Checks
```

### Model Tiers

| Tier | Description | Hardware Requirements | Examples |
|------|-------------|---------------------|----------|
| Small | Lightweight models | 4GB+ RAM | TinyLlama, Phi-2 |
| Medium | Mid-range models | 16GB+ RAM, 8GB VRAM | Mistral-7B |
| Large | High-performance | 32GB+ RAM, 24GB+ VRAM | Mixtral-8x7B |

## 💰 Token Economics

- MULE is the network's native token
- 1 MULE = tier-based token amounts:
  - Small: 1M tokens
  - Medium: 500k tokens
  - Large: 250k tokens
  - XL: 125k tokens
- Platform fee: 10% on transactions
- Welcome bonus: 1.0 MULE for new users
- Fair earnings distribution to providers

## 🔐 Security

- API key authentication
- Provider verification
- Request validation
- Rate limiting
- Health checks
- Secure WebSocket communication

## 🛣️ Roadmap

### Phase 1: Core Infrastructure
- [x] Basic API compatibility
- [x] Provider registration
- [x] Request routing
- [x] Health monitoring

### Phase 2: Token System
- [x] Token tracking
- [x] Provider payments
- [x] Usage accounting
- [x] Free tier implementation

### Phase 3: Network Expansion
- [ ] Advanced routing
- [ ] Multiple model support
- [ ] Performance optimization
- [ ] Community features

## 🤝 Contributing

We welcome contributions! Join the [Discord](https://discord.gg/CcXKkkcbK9) to get started.

## 🙏 Credits

Developed by [Andy Cufari](https://github.com/andycufari) and the LLMule community.
X: @andycufari

## 🌐 Links

- [Website](https://llmule.xyz)
