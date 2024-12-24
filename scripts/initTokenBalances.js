// scripts/initTokenBalances.js
const mongoose = require('mongoose');
const User = require('../src/models/userModel');
const { TokenBalance } = require('../src/models/TokenBalance');
const config = require('../src/config');

async function initBalances() {
  try {
    await mongoose.connect(config.mongodb_uri);
    
    const users = await User.find({});
    console.log(`Found ${users.length} users`);
    
    for (const user of users) {
      const balance = await TokenBalance.findOne({ userId: user._id });
      if (!balance) {
        await TokenBalance.create({
          userId: user._id,
          welcomeBalance: 1000000
        });
        console.log(`Created balance for ${user.email}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

initBalances();