const mongoose = require('mongoose');
const crypto = require('crypto');
const TokenService = require('../services/tokenService');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  apiKey: {
    type: String,
    unique: true,
    required: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  // Basic rate limiting
  rateLimits: {
    requests: {
      type: Number,
      default: 1000
    },
    limit: {
      type: Number,
      default: 1000
    },
    reset: {
      type: Date,
      default: () => new Date(new Date().setMonth(new Date().getMonth() + 1))
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Initialize welcome balance for new users
userSchema.post('save', async function(doc) {
  if (this.isNew) {
    await TokenService.initializeBalance(doc._id);
    console.log(`Welcome balance created for user ${doc._id}`);
  }
});

userSchema.methods.generateApiKey = function() {
  return 'llm_' + crypto.randomBytes(32).toString('hex');
};

const User = mongoose.model('User', userSchema);
module.exports = User;