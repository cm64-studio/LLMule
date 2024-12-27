// scripts/migrateTokenSystem.js
const mongoose = require('mongoose');
const { program } = require('commander');
const { TokenCalculator } = require('../src/config/tokenomics');
require('dotenv').config();

program
  .version('1.0.0')
  .description('LLMule Token System Migration')
  .option('-u, --uri <uri>', 'MongoDB URI', process.env.MONGODB_URI)
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('--reset', 'Reset token collections before migration', false);

async function migrateTokenBalances(isDryRun) {
  console.log('\n=== Migrating Token Balances ===');
  
  try {
    const oldBalances = await mongoose.connection
      .collection('tokenbalances')
      .find({}).toArray();
    
    console.log(`Found ${oldBalances.length} balances to migrate`);

    for (const old of oldBalances) {
      // Calculate MULE balance from old token amounts
      const muleTiny = TokenCalculator.tokensToMules(
        (old.provided?.tiny || 0) - (old.consumed?.tiny || 0),
        'small'
      );
      
      const muleMedium = TokenCalculator.tokensToMules(
        (old.provided?.medium || 0) - (old.consumed?.medium || 0),
        'medium'
      );

      const muleLarge = TokenCalculator.tokensToMules(
        (old.provided?.large || 0) - (old.consumed?.large || 0),
        'large'
      );

      // Add welcome balance
      const muleWelcome = TokenCalculator.tokensToMules(
        old.welcomeBalance || 0,
        'small'
      );

      const totalMules = muleTiny + muleMedium + muleLarge + muleWelcome;

      if (isDryRun) {
        console.log(`Would migrate balance for user ${old.userId}:`, {
          oldBalance: {
            tiny: old.provided?.tiny || 0,
            medium: old.provided?.medium || 0,
            large: old.provided?.large || 0,
            welcome: old.welcomeBalance
          },
          newBalance: totalMules
        });
      } else {
        await mongoose.connection.collection('balances').updateOne(
          { userId: old.userId },
          {
            $set: {
              balance: totalMules,
              lastUpdated: new Date()
            }
          },
          { upsert: true }
        );
      }
    }

    console.log('✅ Balance migration completed');
  } catch (error) {
    console.error('Error migrating balances:', error);
    throw error;
  }
}

async function migrateUsageLogs(isDryRun) {
  console.log('\n=== Migrating Usage Logs ===');
  
  try {
    const oldLogs = await mongoose.connection
      .collection('usagelogs')
      .find({}).toArray();
    
    console.log(`Found ${oldLogs.length} usage logs to migrate`);

    for (const old of oldLogs) {
      const muleAmount = TokenCalculator.tokensToMules(
        old.tokensUsed,
        old.modelTier
      );

      const newTransaction = {
        timestamp: old.timestamp,
        transactionType: old.isSelfService ? 'self_service' : 'consumption',
        consumerId: old.consumerId,
        providerId: old.providerId,
        model: old.model,
        modelType: 'llm',
        modelTier: old.modelTier,
        rawAmount: old.tokensUsed,
        muleAmount: TokenCalculator.formatMules(muleAmount),
        platformFee: TokenCalculator.formatMules(muleAmount * 0.1),
        metadata: {
          promptTokens: old.promptTokens,
          completionTokens: old.completionTokens,
          migrated: true,
          originalId: old._id
        }
      };

      if (isDryRun) {
        console.log('Would create transaction:', newTransaction);
      } else {
        await mongoose.connection
          .collection('transactions')
          .insertOne(newTransaction);
      }
    }

    console.log('✅ Usage logs migration completed');
  } catch (error) {
    console.error('Error migrating usage logs:', error);
    throw error;
  }
}

async function main() {
  try {
    program.parse();
    const options = program.opts();

    console.log('Connecting to MongoDB...');
    await mongoose.connect(options.uri);
    console.log('✅ Connected to MongoDB');

    if (options.reset) {
      console.log('\n=== Resetting collections ===');
      await mongoose.connection.collection('balances').drop().catch(() => {});
      await mongoose.connection.collection('transactions').drop().catch(() => {});
      console.log('✅ Collections reset completed');
    }

    await migrateTokenBalances(options.dryRun);
    await migrateUsageLogs(options.dryRun);

    console.log('\n✨ Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();