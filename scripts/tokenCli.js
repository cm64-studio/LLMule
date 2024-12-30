#!/usr/bin/env node
// scripts/tokenCLI.js
const { program } = require('commander');
const mongoose = require('mongoose');
const User = require('../src/models/userModel');
const Transaction = require('../src/models/transactionModel');
const { tokenConfig, TokenCalculator } = require('../src/config/tokenomics');
const chalk = require('chalk'); // Add for better CLI output
require('dotenv').config();

program
  .version('1.0.0')
  .description('LLMule Token Management CLI');

program
  .command('check-balance')
  .description('Check user token balance and usage')
  .requiredOption('-e, --email <email>', 'User email')
  .option('--debug', 'Show debug information')
  .action(async (options) => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log(chalk.green('Connected to MongoDB'));
      
      const user = await User.findOne({ email: options.email });
      if (!user) {
        console.error(chalk.red('User not found'));
        process.exit(1);
      }

      // Get user's transactions
      const transactions = await Transaction.aggregate([
        { $match: { consumerId: user._id } },
        { $sort: { timestamp: -1 } },
        { $limit: 5 }, // Show last 5 transactions
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$muleAmount' },
            transactions: { $push: '$$ROOT' }
          }
        }
      ]);

      console.log(chalk.bold('\nUser Information'));
      console.log(`Email: ${user.email}`);
      console.log(`User ID: ${user._id}`);
      console.log(`Status: ${user.status}`);

      if (transactions.length > 0) {
        const { totalSpent, transactions: recentTxs } = transactions[0];
        
        console.log(chalk.bold('\nToken Usage'));
        console.log(`Total MULE spent: ${totalSpent.toFixed(6)}`);
        
        console.log(chalk.bold('\nRecent Transactions'));
        recentTxs.forEach(tx => {
          console.log(`${new Date(tx.timestamp).toLocaleString()} | ${tx.transactionType} | ${tx.muleAmount.toFixed(6)} MULE | ${tx.model}`);
        });
      }

      if (options.debug) {
        console.log(chalk.bold('\nDebug Information'));
        console.log('User object:', user);
        console.log('Raw transactions:', transactions);
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program
  .command('add-balance')
  .description('Add MULE tokens to user balance')
  .requiredOption('-e, --email <email>', 'User email')
  .requiredOption('-a, --amount <amount>', 'Amount of MULE tokens')
  .action(async (options) => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      
      const user = await User.findOne({ email: options.email });
      if (!user) {
        console.error(chalk.red('User not found'));
        process.exit(1);
      }

      const amount = parseFloat(options.amount);
      if (isNaN(amount) || amount <= 0) {
        console.error(chalk.red('Invalid amount'));
        process.exit(1);
      }

      // Create deposit transaction
      await Transaction.create({
        timestamp: new Date(),
        transactionType: 'deposit',
        consumerId: user._id,
        model: 'system',
        modelType: 'llm',
        modelTier: 'small',
        muleAmount: amount,
        platformFee: 0,
        metadata: {
          source: 'admin_cli',
          note: 'Manual balance addition'
        }
      });

      console.log(chalk.green(`Added ${amount} MULE to ${options.email}`));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
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

      const stats = await Transaction.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            transactionType: { $in: ['consumption', 'self_service'] }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              modelTier: '$modelTier'
            },
            totalMule: { $sum: '$muleAmount' },
            totalFees: { $sum: '$platformFee' },
            requestCount: { $sum: 1 },
            uniqueUsers: { $addToSet: '$consumerId' }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]);

      if (options.output) {
        const csv = [
          'Date,Model Tier,Transactions,Total MULE,Platform Fees,Unique Users',
          ...stats.map(s => 
            `${s._id.date},${s._id.modelTier},${s.requestCount},${s.totalMule.toFixed(6)},${s.totalFees.toFixed(6)},${s.uniqueUsers.length}`
          )
        ].join('\n');

        require('fs').writeFileSync(options.output, csv);
        console.log(chalk.green(`Report saved to ${options.output}`));
      } else {
        console.table(stats.map(s => ({
          Date: s._id.date,
          Tier: s._id.modelTier,
          Requests: s.requestCount,
          'Total MULE': s.totalMule.toFixed(6),
          'Platform Fees': s.totalFees.toFixed(6),
          'Unique Users': s.uniqueUsers.length
        })));
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse(process.argv);