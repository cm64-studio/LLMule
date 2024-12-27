// controllers/balanceController.js
const TokenService = require('../services/tokenService');
const { TokenCalculator, tokenConfig } = require('../config/tokenomics');

class BalanceController {
  static async getBalance(req, res) {
    try {
      const balance = await TokenService.getBalance(req.user._id);

      // Calculate available tokens per tier
      const availableTokens = {};
      Object.entries(tokenConfig.conversion_rates).forEach(([tier, rate]) => {
        availableTokens[tier] = TokenCalculator.mulesToTokens(balance.balance, tier);
      });

      res.json({
        mule_balance: balance.balance,
        available_tokens: availableTokens,
        last_updated: balance.lastUpdated
      });

    } catch (error) {
      console.error('Balance fetch error:', error);
      res.status(500).json({
        error: 'Failed to fetch balance',
        message: error.message
      });
    }
  }

  static async getTransactionHistory(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      const startDate = req.query.start ? new Date(req.query.start) : null;
      const endDate = req.query.end ? new Date(req.query.end) : null;

      const { transactions, pagination } = await TokenService.getTransactionHistory({
        userId: req.user._id,
        page,
        limit,
        type,
        startDate,
        endDate
      });

      res.json({
        transactions: transactions.map(t => ({
          id: t._id,
          type: t.transactionType,
          timestamp: t.timestamp,
          model: t.model,
          model_type: t.modelType,
          model_tier: t.modelTier,
          raw_amount: t.rawAmount,
          mule_amount: t.muleAmount,
          platform_fee: t.platformFee,
          metadata: t.metadata
        })),
        pagination
      });

    } catch (error) {
      console.error('Transaction history error:', error);
      res.status(500).json({
        error: 'Failed to fetch transaction history',
        message: error.message
      });
    }
  }

  static async getProviderStats(req, res) {
    try {
      const timeframe = req.query.timeframe || '30d';
      const stats = await TokenService.getProviderStats(req.user._id, timeframe);

      res.json({
        timeframe,
        stats: {
          total_earnings: stats.totalEarnings,
          total_fees: stats.totalFees,
          request_count: stats.requestCount,
          per_tier: stats.perTier,
          daily_stats: stats.dailyStats
        }
      });

    } catch (error) {
      console.error('Provider stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch provider statistics',
        message: error.message
      });
    }
  }

  static async getConsumerStats(req, res) {
    try {
      const timeframe = req.query.timeframe || '30d';
      const stats = await TokenService.getConsumerStats(req.user._id, timeframe);

      res.json({
        timeframe,
        stats: {
          total_spent: stats.totalSpent,
          request_count: stats.requestCount,
          per_tier: stats.perTier,
          daily_stats: stats.dailyStats
        }
      });

    } catch (error) {
      console.error('Consumer stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch consumer statistics',
        message: error.message
      });
    }
  }
}

module.exports = BalanceController;