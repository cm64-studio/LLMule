// src/services/authService.js
const User = require('../models/userModel');
const emailService = require('./emailService');
const crypto = require('node:crypto'); // Changed this line

class AuthService {
  async registerUser(email) {
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      throw new Error('Email already registered');
    }

    // Create new user
    user = new User({ email });
    user.apiKey = user.generateApiKey();
    const verificationToken = user.generateEmailVerificationToken();
    
    await user.save();
    console.log('User registered:', user);
    
    // Send verification email
    console.log('Sending verification email to:', email);
    await emailService.sendVerificationEmail(email, verificationToken);
    console.log('Email sent');
    return {
      message: 'Registration successful. Please check your email for verification.',
      apiKey: user.apiKey
    };
  }

  async verifyEmail(token) {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    await user.save();

    return { message: 'Email verified successfully' };
  }
}

module.exports = new AuthService();