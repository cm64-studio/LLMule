// scripts/activateUser.js
const mongoose = require('mongoose');
const { program } = require('commander');
const User = require('../src/models/userModel');
const config = require('../src/config');

program
  .version('1.0.0')
  .description('LLMule User Activation CLI')
  .requiredOption('-e, --email <email>', 'User email')
  .option('-d, --deactivate', 'Deactivate instead of activate')
  .option('--dry-run', 'Show what would be done without making changes');

async function main() {
  try {
    await mongoose.connect(config.mongodb_uri);
    const options = program.opts();

    const user = await User.findOne({ email: options.email });
    if (!user) {
      console.error(`User not found: ${options.email}`);
      process.exit(1);
    }

    const newStatus = options.deactivate ? 'suspended' : 'active';
    
    if (options.dryRun) {
      console.log(`Would ${options.deactivate ? 'deactivate' : 'activate'} user:`, {
        email: user.email,
        currentStatus: user.status,
        newStatus
      });
    } else {
      user.status = newStatus;
      await user.save();
      console.log(`Successfully ${options.deactivate ? 'deactivated' : 'activated'} user:`, {
        email: user.email,
        status: user.status
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

program.parse(process.argv);
main();