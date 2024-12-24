// src/controllers/balanceController.js
const { TokenBalance } = require('../models/TokenBalance');

const getBalance = async (req, res) => {
  try {
    const balance = await TokenBalance.findOne({ 
      userId: req.user._id 
    });

    if (!balance) {
      return res.status(404).json({
        error: 'Balance not found',
        code: 'balance_not_found'
      });
    }

    res.json({
      tiny: {
        provided: balance.provided.tiny,
        consumed: balance.consumed.tiny,
        available: balance.getAvailableTokens('tiny')
      },
      small: {
        provided: balance.provided.small,
        consumed: balance.consumed.small,
        available: balance.getAvailableTokens('small') 
      },
      medium: {
        provided: balance.provided.medium,
        consumed: balance.consumed.medium,
        available: balance.getAvailableTokens('medium')
      },
      welcome_balance: balance.welcomeBalance
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get balance',
      code: 'balance_error'
    });
  }
};

module.exports = { getBalance };

