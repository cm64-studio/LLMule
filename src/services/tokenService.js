// services/tokenService.js
const mongoose = require('mongoose');
const { Balance, Transaction } = require('../models/balanceModels');
const { tokenConfig, TokenCalculator } = require('../config/tokenomics');
const logger = require('../utils/logger');




class TokenService {
    static async _handleProviderBalance(providerId, providerAmount) {
        // Skip balance update for UUID providers (they're anonymous/unregistered)
        if (providerId && providerId.length === 24) {
            try {
                await Balance.findOneAndUpdate(
                    { userId: providerId },
                    {
                        $inc: { balance: providerAmount },
                        $set: { lastUpdated: new Date() }
                    },
                    { upsert: true }
                );
            } catch (error) {
                logger.warn(`Provider balance update skipped for ${providerId}: ${error.message}`);
            }
        }
    }
    static async initializeBalance(userId) {
        try {
            return await Balance.create({
                userId,
                balance: tokenConfig.MULE.welcome_amount
            });
        } catch (error) {
            logger.error('Failed to initialize balance:', error);
            throw error;
        }
    }

    static async addBalance(userId, amount) {
        try {
            // Validate amount
            const muleAmount = TokenCalculator.formatMules(amount);
            if (muleAmount <= 0) {
                throw new Error('Invalid amount');
            }

            // Update balance using atomic operation
            const balance = await Balance.findOneAndUpdate(
                { userId },
                {
                    $inc: { balance: muleAmount },
                    $set: { lastUpdated: new Date() }
                },
                {
                    new: true,
                    upsert: true
                }
            );

            // Create transaction record
            await Transaction.create({
                timestamp: new Date(),
                transactionType: 'deposit',
                consumerId: userId,
                model: 'system',
                modelType: 'llm',
                modelTier: 'small',
                rawAmount: TokenCalculator.mulesToTokens(muleAmount, 'small'),
                muleAmount: muleAmount,
                platformFee: 0,
                metadata: {
                    type: 'admin_deposit',
                    description: 'Manual balance addition'
                }
            });

            return balance;

        } catch (error) {
            logger.error('Failed to add balance:', error);
            throw error;
        }
    }

    static async getBalance(userId) {
        try {
            const balance = await Balance.findOne({ userId });
            if (!balance) {
                throw new Error('Balance not found');
            }
            return balance;
        } catch (error) {
            logger.error('Failed to get balance:', error);
            throw error;
        }
    }

    static async processUsage({
        consumerId,
        providerId,
        model,
        modelType,
        modelTier,
        usage,
        performance
      }) {
        try {
          const muleAmount = TokenCalculator.tokensToMules(usage.totalTokens, modelTier);
          const platformFee = muleAmount * tokenConfig.fees.platform_fee;
          const isSelfService = providerId && consumerId.toString() === providerId.toString();
      
          // Create single transaction record with all info
          const transaction = await Transaction.create({
            timestamp: new Date(),
            transactionType: isSelfService ? 'self_service' : 'consumption',
            consumerId,
            providerId,
            model,
            modelType,
            modelTier,
            muleAmount: TokenCalculator.formatMules(muleAmount),
            platformFee: TokenCalculator.formatMules(platformFee),
            usage: {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              duration_seconds: performance.duration_seconds,
              tokens_per_second: performance.tokens_per_second
            }
          });
      
          // Update balances if not self-service
          if (!isSelfService) {
            await this._updateBalances(consumerId, providerId, muleAmount, platformFee);
          }
      
          return transaction;
        } catch (error) {
          console.error('Failed to process usage:', error);
          throw error;
        }
    }

    static async updateProviderMetrics(providerId, performance) {
        try {
          // Update rolling average of tokens_per_second
          await Provider.findOneAndUpdate(
            { userId: providerId },
            {
              $push: {
                'performance.history': {
                  $each: [{
                    timestamp: new Date(),
                    tokens_per_second: performance.tokens_per_second,
                    duration_seconds: performance.duration_seconds
                  }],
                  $slice: -100 // Keep last 100 entries
                }
              },
              $inc: {
                'performance.total_requests': 1,
                'performance.total_tokens': performance.total_tokens
              }
            },
            { upsert: true }
          );
        } catch (error) {
          console.error('Failed to update provider metrics:', error);
        }
      }
    

    static async getTransactionHistory({
        userId,
        page = 1,
        limit = 20,
        type,
        startDate,
        endDate
    }) {
        try {
            const query = {
                $or: [
                    { consumerId: userId },
                    { providerId: userId }
                ]
            };

            if (type) {
                query.transactionType = type;
            }

            if (startDate || endDate) {
                query.timestamp = {};
                if (startDate) query.timestamp.$gte = startDate;
                if (endDate) query.timestamp.$lte = endDate;
            }

            const [transactions, total] = await Promise.all([
                Transaction.find(query)
                    .sort({ timestamp: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit),
                Transaction.countDocuments(query)
            ]);

            return {
                transactions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            };

        } catch (error) {
            logger.error('Failed to get transaction history:', error);
            throw error;
        }
    }

    static async getProviderStats(userId, timeframe = '30d') {
        try {
            const startDate = this._getStartDateFromTimeframe(timeframe);

            const stats = await Transaction.aggregate([
                {
                    $match: {
                        providerId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
                        transactionType: 'consumption',
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            modelTier: '$modelTier',
                            day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                        },
                        totalMules: { $sum: '$muleAmount' },
                        totalFees: { $sum: '$platformFee' },
                        requestCount: { $sum: 1 }
                    }
                },
                {
                    $sort: { '_id.day': 1 }
                }
            ]);

            return this._formatProviderStats(stats);

        } catch (error) {
            logger.error('Failed to get provider stats:', error);
            throw error;
        }
    }

    static async getConsumerStats(userId, timeframe = '30d') {
        try {
            const startDate = this._getStartDateFromTimeframe(timeframe);

            const stats = await Transaction.aggregate([
                {
                    $match: {
                        consumerId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            type: '$transactionType',
                            modelTier: '$modelTier',
                            day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                        },
                        totalMules: { $sum: '$muleAmount' },
                        requestCount: { $sum: 1 }
                    }
                },
                {
                    $sort: { '_id.day': 1 }
                }
            ]);

            return this._formatConsumerStats(stats);

        } catch (error) {
            logger.error('Failed to get consumer stats:', error);
            throw error;
        }
    }

    // Helper methods
    static _getStartDateFromTimeframe(timeframe) {
        const now = new Date();
        switch (timeframe) {
            case '7d':
                return new Date(now.setDate(now.getDate() - 7));
            case '30d':
                return new Date(now.setDate(now.getDate() - 30));
            case '90d':
                return new Date(now.setDate(now.getDate() - 90));
            case '1y':
                return new Date(now.setFullYear(now.getFullYear() - 1));
            default:
                return new Date(now.setDate(now.getDate() - 30));
        }
    }

    static _formatProviderStats(stats) {
        const perTier = {};
        const dailyStats = {};
        let totalEarnings = 0;
        let totalFees = 0;
        let requestCount = 0;

        stats.forEach(stat => {
            const { modelTier, day } = stat._id;

            // Per tier stats
            if (!perTier[modelTier]) {
                perTier[modelTier] = {
                    earnings: 0,
                    fees: 0,
                    requests: 0
                };
            }
            perTier[modelTier].earnings += stat.totalMules;
            perTier[modelTier].fees += stat.totalFees;
            perTier[modelTier].requests += stat.requestCount;

            // Daily stats
            if (!dailyStats[day]) {
                dailyStats[day] = {
                    earnings: 0,
                    fees: 0,
                    requests: 0
                };
            }
            dailyStats[day].earnings += stat.totalMules;
            dailyStats[day].fees += stat.totalFees;
            dailyStats[day].requests += stat.requestCount;

            // Totals
            totalEarnings += stat.totalMules;
            totalFees += stat.totalFees;
            requestCount += stat.requestCount;
        });

        return {
            totalEarnings: TokenCalculator.formatMules(totalEarnings),
            totalFees: TokenCalculator.formatMules(totalFees),
            requestCount,
            perTier,
            dailyStats
        };
    }

    static _formatConsumerStats(stats) {
        const perTier = {};
        const dailyStats = {};
        const perType = {
            consumption: { mules: 0, requests: 0 },
            self_service: { mules: 0, requests: 0 }
        };
        let totalSpent = 0;
        let requestCount = 0;

        stats.forEach(stat => {
            const { type, modelTier, day } = stat._id;

            // Per tier stats
            if (!perTier[modelTier]) {
                perTier[modelTier] = {
                    total: 0,
                    consumption: 0,
                    self_service: 0,
                    requests: 0
                };
            }
            perTier[modelTier].total += stat.totalMules;
            perTier[modelTier][type] = (perTier[modelTier][type] || 0) + stat.totalMules;
            perTier[modelTier].requests += stat.requestCount;

            // Daily stats
            if (!dailyStats[day]) {
                dailyStats[day] = {
                    total: 0,
                    consumption: 0,
                    self_service: 0,
                    requests: 0
                };
            }
            dailyStats[day].total += stat.totalMules;
            dailyStats[day][type] = (dailyStats[day][type] || 0) + stat.totalMules;
            dailyStats[day].requests += stat.requestCount;

            // Per type stats
            perType[type].mules += stat.totalMules;
            perType[type].requests += stat.requestCount;

            // Totals
            totalSpent += stat.totalMules;
            requestCount += stat.requestCount;
        });

        // Format all MULE amounts
        totalSpent = TokenCalculator.formatMules(totalSpent);
        Object.keys(perType).forEach(type => {
            perType[type].mules = TokenCalculator.formatMules(perType[type].mules);
        });
        Object.keys(perTier).forEach(tier => {
            perTier[tier].total = TokenCalculator.formatMules(perTier[tier].total);
            perTier[tier].consumption = TokenCalculator.formatMules(perTier[tier].consumption);
            perTier[tier].self_service = TokenCalculator.formatMules(perTier[tier].self_service);
        });
        Object.keys(dailyStats).forEach(day => {
            dailyStats[day].total = TokenCalculator.formatMules(dailyStats[day].total);
            dailyStats[day].consumption = TokenCalculator.formatMules(dailyStats[day].consumption);
            dailyStats[day].self_service = TokenCalculator.formatMules(dailyStats[day].self_service);
        });

        return {
            totalSpent,
            requestCount,
            perType,
            perTier,
            dailyStats
        };
    }
}

module.exports = TokenService;