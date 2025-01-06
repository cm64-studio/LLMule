// services/tokenService.js
const mongoose = require('mongoose');
const { Balance } = require('../models/balanceModels');
const Transaction = require('../models/transactionModel');
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
            // First try to find existing balance
            const existingBalance = await Balance.findOne({ userId });

            if (existingBalance) {
                console.log(`Balance already exists for user ${userId}`);
                return existingBalance;
            }

            // Use findOneAndUpdate with upsert to handle race conditions
            const balance = await Balance.findOneAndUpdate(
                { userId },
                {
                    $setOnInsert: {
                        balance: tokenConfig.MULE.welcome_amount || 1.0,
                        lastUpdated: new Date()
                    }
                },
                {
                    upsert: true,
                    new: true,
                    runValidators: true
                }
            );

            // Only create welcome transaction if balance was actually created
            if (balance.balance === tokenConfig.MULE.welcome_amount) {
                try {
                    await Transaction.create({
                        timestamp: new Date(),
                        transactionType: 'deposit',
                        consumerId: userId,
                        model: 'system_welcome_bonus',
                        modelType: 'llm',
                        modelTier: 'small',
                        rawAmount: tokenConfig.MULE.welcome_amount || 1.0,
                        muleAmount: tokenConfig.MULE.welcome_amount || 1.0,
                        platformFee: 0,
                        metadata: {
                            type: 'welcome_bonus',
                            description: 'Initial welcome balance'
                        }
                    });
                } catch (transactionError) {
                    console.warn('Failed to create welcome transaction:', transactionError);
                    // Continue since balance was created successfully
                }
            }

            return balance;

        } catch (error) {
            console.error('Failed to initialize balance:', error);
            if (error.code === 11000) {
                // If we hit a duplicate key error, try to fetch the existing balance
                try {
                    const existingBalance = await Balance.findOne({ userId });
                    if (existingBalance) {
                        return existingBalance;
                    }
                } catch (fetchError) {
                    console.error('Failed to fetch existing balance:', fetchError);
                }
            }
            throw new Error('Failed to initialize balance');
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
            // Try to find existing balance
            let balance = await Balance.findOne({ userId });

            // If no balance found, initialize it
            if (!balance) {
                console.log(`Initializing balance for user ${userId}`);
                try {
                    balance = await this.initializeBalance(userId);
                } catch (initError) {
                    // If initialization fails, try one more time to find the balance
                    // in case it was created by a concurrent request
                    balance = await Balance.findOne({ userId });
                    if (!balance) {
                        throw initError;
                    }
                }
            }

            return {
                balance: balance.balance || 0,
                lastUpdated: balance.lastUpdated || new Date(),
                userId: balance.userId
            };
        } catch (error) {
            console.error('Failed to get/initialize balance:', error);
            if (error.code === 11000) {
                // If we hit a duplicate key error, the balance was probably just created
                // Try one more time to fetch it
                const existingBalance = await Balance.findOne({ userId });
                if (existingBalance) {
                    return {
                        balance: existingBalance.balance || 0,
                        lastUpdated: existingBalance.lastUpdated || new Date(),
                        userId: existingBalance.userId
                    };
                }
            }
            throw new Error('Failed to retrieve balance');
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
            // Log initial data
            console.log('Processing usage input:', {
                usage,
                modelTier,
                performance
            });
    
            // Validate input
            if (!usage || typeof usage.totalTokens !== 'number') {
                throw new Error(`Invalid usage data: totalTokens must be a number, got ${typeof usage?.totalTokens}`);
            }
    
            // Calculate MULE amounts with validation
            let muleAmount = 0;
            try {
                muleAmount = parseFloat(TokenCalculator.tokensToMules(usage.totalTokens, modelTier)) || 0;
                if (isNaN(muleAmount)) {
                    console.error('Invalid muleAmount calculation:', {
                        tokens: usage.totalTokens,
                        tier: modelTier,
                        result: muleAmount
                    });
                    muleAmount = 0;
                }
            } catch (error) {
                console.error('Error calculating muleAmount:', error);
                muleAmount = 0;
            }
    
            // Calculate platform fee with validation
            let platformFee = Math.max(0, parseFloat((muleAmount * tokenConfig.fees.platform_fee).toFixed(6)));
            if (isNaN(platformFee)) {
                console.error('Invalid platformFee calculation:', {
                    muleAmount,
                    fee: tokenConfig.fees.platform_fee,
                    result: platformFee
                });
                platformFee = 0;
            }
    
            const isSelfService = providerId && consumerId.toString() === providerId.toString();
    
            // Prepare transaction data with validated numbers
            const transactionData = {
                timestamp: new Date(),
                transactionType: isSelfService ? 'self_service' : 'consumption',
                consumerId,
                providerId,
                model,
                modelType,
                modelTier,
                rawAmount: parseInt(usage.totalTokens, 10),
                muleAmount: parseFloat(muleAmount.toFixed(6)),
                platformFee: parseFloat(platformFee.toFixed(6)),
                // Explicitly create the usage object matching the schema structure
                usage: {
                    promptTokens: Math.max(0, parseInt(usage.promptTokens || 0, 10)),
                    completionTokens: Math.max(0, parseInt(usage.completionTokens || 0, 10)),
                    totalTokens: Math.max(0, parseInt(usage.totalTokens || 0, 10)),
                    duration_seconds: Math.max(0, parseFloat(performance.duration_seconds || 0)),
                    tokens_per_second: Math.max(0, parseFloat(performance.tokens_per_second || 0))
                }
            };
    
            console.log('Creating transaction with validated data:', {
                ...transactionData,
                consumerId: consumerId.toString(),
                providerId: providerId?.toString()
            });

            // Add this before creating the transaction
            console.log('Validating transaction data structure:', {
                hasUsage: !!transactionData.usage,
                usageFields: transactionData.usage ? Object.keys(transactionData.usage) : [],
                requiredFields: ['promptTokens', 'completionTokens', 'totalTokens', 'duration_seconds', 'tokens_per_second']
            });

            // Add this before creating the transaction
            if (providerId) {
                transactionData.providerId = new mongoose.Types.ObjectId(providerId);
            }

    
            // Create transaction record
            const transaction = await Transaction.create(transactionData);

            // Verify the saved data
            console.log('Saved transaction data:', {
                id: transaction._id,
                hasUsage: !!transaction.usage,
                usageData: transaction.usage
            });
    
            // Update balances for non-self-service transactions
            if (!isSelfService && muleAmount > 0) {
                await this._updateBalances(consumerId, providerId, muleAmount, platformFee);
                console.log('Balances updated:', {
                    consumerId: consumerId.toString(),
                    providerId: providerId.toString(),
                    muleAmount,
                    platformFee
                });
            } else {
                console.log('Self-service transaction or zero amount - no balance update needed');
            }
    
            return transaction;
    
        } catch (error) {
            console.error('Failed to process usage:', error);
            if (error.name === 'ValidationError') {
                console.error('Schema validation error:', {
                    errors: error.errors,
                    missingFields: Object.keys(error.errors),
                    providedData: transactionData
                });
            }
            throw error;
        }
    }

    static async updateProviderMetrics(providerId, performance) {
        // Just log the performance metrics with the transaction
        // No need to update user document since everything is in transactions
        console.log('Provider performance logged:', {
            providerId: providerId?.toString(),
            tokens_per_second: performance.tokens_per_second,
            duration_seconds: performance.duration_seconds,
            total_tokens: performance.total_tokens
        });
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

    static async getProviderStats(providerId, timeframe = '30d') {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(timeframe));

            const stats = await Transaction.aggregate([
                {
                    $match: {
                        providerId: new mongoose.Types.ObjectId(providerId),
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: 1 },
                        totalTokens: { $sum: '$rawAmount' },
                        totalEarned: { $sum: '$muleAmount' },
                        avgTokensPerSecond: {
                            $avg: '$usage.tokens_per_second'
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalRequests: 0,
                totalTokens: 0,
                totalEarned: 0,
                avgTokensPerSecond: 0
            };
        } catch (error) {
            console.error('Failed to get provider stats:', error);
            return null;
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

    static async _updateBalances(consumerId, providerId, muleAmount, platformFee) {
        try {
            console.log('Updating balances:', {
                consumerId: consumerId.toString(),
                providerId: providerId?.toString(),
                muleAmount,
                platformFee
            });

            // 1. Decrease consumer balance
            const consumerUpdate = await Balance.findOneAndUpdate(
                { userId: consumerId },
                {
                    $inc: { balance: -muleAmount },
                    $set: { lastUpdated: new Date() }
                },
                { new: true }
            );

            if (!consumerUpdate) {
                throw new Error('Consumer balance not found');
            }

            console.log('Consumer balance updated:', {
                userId: consumerId.toString(),
                newBalance: consumerUpdate.balance
            });

            // 2. Increase provider balance (if not self-service)
            if (providerId && consumerId.toString() !== providerId.toString()) {
                const providerAmount = muleAmount - platformFee;

                const providerUpdate = await Balance.findOneAndUpdate(
                    { userId: providerId },
                    {
                        $inc: { balance: providerAmount },
                        $set: { lastUpdated: new Date() }
                    },
                    { new: true, upsert: true }
                );

                console.log('Provider balance updated:', {
                    userId: providerId.toString(),
                    newBalance: providerUpdate.balance,
                    amountAdded: providerAmount
                });
            } else {
                console.log('Self-service transaction - no provider balance update needed');
            }

        } catch (error) {
            console.error('Balance update failed:', error);
            throw error;
        }
    }

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