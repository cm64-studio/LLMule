// models/balanceModels.js
const mongoose = require('mongoose');
const { tokenConfig } = require('../config/tokenomics');

const balanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: tokenConfig.MULE.welcome_amount,
    get: v => Number(v.toFixed(tokenConfig.MULE.decimals))
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Export just the Balance model, remove Transaction export
const Balance = mongoose.model('Balance', balanceSchema);
module.exports = { Balance };