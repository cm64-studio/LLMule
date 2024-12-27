// scripts/manageTokens.js
const mongoose = require('mongoose');
const { program } = require('commander');
const { TokenManager } = require('../src/services/TokenManager');
const User = require('../src/models/userModel');
const config = require('../src/config');

program
  .version('1.0.0')
  .description('LLMule Token Management CLI');

program
  .command('add-tokens')
  .description('Add tokens to a user account')
  .requiredOption('-e, --email <email>', 'User email')
  .requiredOption('-t, --tier <tier>', 'Token tier (tiny, small, medium)')
  .requiredOption('-a, --amount <amount>', 'Amount of tokens to add')
  .action(async (options) => {
    try {
      await mongoose.connect(config.mongodb_uri);
      console.log('Connected to MongoDB');

      const { email, tier, amount } = options;
      
      const user = await User.findOne({ email });
      if (!user) {
        console.error('User not found');
        process.exit(1);
      }

      await TokenManager.updateProviderTokens(
        user._id,
        tier,
        parseInt(amount)
      );

      console.log(`Successfully added ${amount} ${tier} tokens to ${email}`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('check-balance')
  .description('Check user token balance')
  .requiredOption('-e, --email <email>', 'User email')
  .action(async (options) => {
    try {
      await mongoose.connect(config.mongodb_uri);
      const user = await User.findOne({ email: options.email });
      if (!user) {
        console.error('User not found');
        process.exit(1);
      }

      const balance = await TokenBalance.findOne({ userId: user._id });
      console.log('Token Balance:', {
        email: user.email,
        provided: balance.provided,
        consumed: balance.consumed,
        welcomeBalance: balance.welcomeBalance
      });
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);