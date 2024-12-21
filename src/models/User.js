// src/models/user.js
const mongoose = require('mongoose');
const crypto = require('node:crypto');  // Changed this line

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
      default: 1000 // Monthly request limit
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

// Generate secure API key
userSchema.methods.generateApiKey = function() {
  return 'llm_' + crypto.randomBytes(32).toString('hex');
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

const User = mongoose.model('User', userSchema);
module.exports = User;