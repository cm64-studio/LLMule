// src/models/userModel.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { TokenBalance } = require('./TokenBalance');

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
  userType: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.post('save', async function(doc) {
  try {
    if (this.isNew) {
      console.log('Creating initial token balance for user:', doc._id);
      const balance = await TokenBalance.findOne({ userId: doc._id });
      
      if (!balance) {
        await TokenBalance.create({
          userId: doc._id,
          welcomeBalance: 1000000 // 1M welcome tokens
        });
        console.log('Token balance created successfully');
      }
    }
  } catch (error) {
    console.error('Error creating token balance:', error);
  }
});

userSchema.methods.generateApiKey = function() {
  return 'llm_' + crypto.randomBytes(32).toString('hex');
};

userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return token;
};

const User = mongoose.model('User', userSchema);
module.exports = User;