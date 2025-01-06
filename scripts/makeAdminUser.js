#!/usr/bin/env node

const mongoose = require('mongoose');
const User = require('../src/models/userModel');
const config = require('../src/config');

const makeAdmin = async (email) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodb_uri);
    console.log('Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    // Make user admin
    user.isAdmin = true;
    await user.save();

    console.log(`Successfully made ${email} an admin`);
    console.log(`API Key: ${user.apiKey}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Please provide an email address');
  console.log('Usage: node makeAdminUser.js <email>');
  process.exit(1);
}

makeAdmin(email); 