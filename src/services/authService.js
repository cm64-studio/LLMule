// src/services/authService.js
const User = require('../models/userModel');
const emailService = require('./emailService');

class AuthService {
  async registerUser(email) {
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      console.log('User found:', email);
      //send the current api key to the user
      const apiKey = user.apiKey;
      await emailService.sendWelcomeEmail(email, apiKey);
      return {
        message: 'Welcome back! Check your email for your API key.',
        apiKey
      };
      
    }

    // Create new user with auto-verified status
    user = new User({ 
      email,
      emailVerified: true // Auto-verify since we're sending API key directly
    });
    
    // Generate API key
    const apiKey = user.generateApiKey();
    user.apiKey = apiKey;
    
    await user.save();
    console.log('User registered:', user);
    
    // Send welcome email with API key
    console.log('Sending welcome email to:', email);
    await emailService.sendWelcomeEmail(email, apiKey);
    console.log('Welcome email sent');

    return {
      message: 'Registration successful. Check your email for your API key.',
      apiKey // Return API key in response
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