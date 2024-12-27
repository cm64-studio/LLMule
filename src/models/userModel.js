// models/userModel.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const TokenService = require('../services/tokenService');
const { tokenConfig } = require('../config/tokenomics');

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
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  userType: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  provider: {
    isProvider: {
      type: Boolean,
      default: false
    },
    models: [{
      name: String,
      type: String,
      tier: String
    }],
    lastSeen: Date
  },
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
  try {
    if (this.isNew) {
      await TokenService.initializeBalance(doc._id);
      console.log(`Welcome balance created for user ${doc._id}`);
    }
  } catch (error) {
    console.error('Error creating welcome balance:', error);
  }
});

userSchema.methods.generateApiKey = function() {
  return 'llm_' + crypto.randomBytes(32).toString('hex');
};

userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Get user's tier based on usage and balance
userSchema.methods.getUserTier = async function() {
  try {
    const stats = await TokenService.getConsumerStats(this._id, '30d');
    
    if (stats.totalSpent > 100) { // Over 100 MULE spent
      return 'enterprise';
    } else if (stats.totalSpent > 10) { // Over 10 MULE spent
      return 'pro';
    }
    return 'free';
  } catch (error) {
    console.error('Error getting user tier:', error);
    return this.userType;
  }
};

// Add provider capabilities
userSchema.methods.registerAsProvider = async function(models) {
  this.provider.isProvider = true;
  this.provider.models = models;
  this.provider.lastSeen = new Date();
  return this.save();
};

const User = mongoose.model('User', userSchema);
module.exports = User;