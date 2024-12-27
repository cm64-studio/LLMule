#!/usr/bin/env node
// scripts/tokenCLI.js
const { program } = require('commander');
const mongoose = require('mongoose');
const TokenService = require('../src/services/tokenService');
const User = require('../src/models/userModel');
const { TokenCalculator } = require('../src/config/tokenomics');
require('dotenv').config();

program
  .version('1.0.0')
  .description('LLMule Token Management CLI');

program
  .command('add-mule')
  .description('Add MULE tokens to a user account')
  .requiredOption('-e, --email <email>', 'User email')
  .requiredOption('-a, --amount <amount>', 'Amount of MULE tokens to add')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');

      const user = await User.findOne({ email: options.email });
      if (!user) {
        console.error('User not found');
        process.exit(1);
      }

      const amount = parseFloat(options.amount);
      if (options.dryRun) {
        console.log(`Would add ${amount} MULE to ${options.email}`);
        process.exit(0);
      }

      await TokenService.addBalance(user._id, amount);
      console.log(`Successfully added ${amount} MULE to ${options.email}`);
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
      await mongoose.connect(process.env.MONGODB_URI);
      
      const user = await User.findOne({ email: options.email });
      if (!user) {
        console.error('User not found');
        process.exit(1);
      }

      const balance = await TokenService.getBalance(user._id);
      const availableTokens = {};
      
      Object.entries(tokenConfig.conversion_rates).forEach(([tier, rate]) => {
        availableTokens[tier] = TokenCalculator.mulesToTokens(balance.balance, tier);
      });

      console.log('Balance for', options.email);
      console.log('MULE Balance:', balance.balance);
      console.log('Available Tokens:', availableTokens);
      console.log('Last Updated:', balance.lastUpdated);
      
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('set-welcome')
  .description('Set welcome balance for new users')
  .requiredOption('-a, --amount <amount>', 'Amount of MULE tokens')
  .action(async (options) => {
    try {
      const amount = parseFloat(options.amount);
      if (isNaN(amount) || amount < 0) {
        throw new Error('Invalid amount');
      }

      // Update tokenomics config
      const configPath = require.resolve('../config/tokenomics');
      const fs = require('fs');
      let content = fs.readFileSync(configPath, 'utf8');
      
      content = content.replace(
        /welcome_amount:\s*[\d.]+/,
        `welcome_amount: ${amount}`
      );

      fs.writeFileSync(configPath, content);
      console.log(`Welcome balance set to ${amount} MULE`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('usage-report')
  .description('Generate usage report')
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <file>', 'Output file (CSV)')
  .action(async (options) => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);

      const startDate = options.start ? new Date(options.start) : new Date(0);
      const endDate = options.end ? new Date(options.end) : new Date();

      const transactions = await TokenService.getSystemStats(startDate, endDate);
      
      if (options.output) {
        const csv = [
          'Date,Transactions,Total MULE,Platform Fees,Active Users',
          ...transactions.map(t => 
            `${t.date},${t.count},${t.totalMule},${t.fees},${t.activeUsers}`
          )
        ].join('\n');

        require('fs').writeFileSync(options.output, csv);
        console.log(`Report saved to ${options.output}`);
      } else {
        console.table(transactions);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);