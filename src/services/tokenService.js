// services/tokenService.js
const mongoose = require('mongoose');
const { Balance } = require('../models/balanceModels');
const Transaction = require('../models/transactionModel');
const { tokenConfig, TokenCalculator } = require('../config/tokenomics');
const logger = require('../utils/logger');
const { Provider } = require('../models/providerModel');

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
            // Validate consumer ID
            if (!mongoose.Types.ObjectId.isValid(consumerId)) {
                throw new Error('Invalid consumer ID');
            }

            // Determine transaction type
            const isSelfService = consumerId.toString() === providerId?.toString();
            const transactionType = isSelfService ? 'self_service' : 'consumption';

            // Calculate MULE amount
            const muleAmount = TokenCalculator.tokensToMules(usage.totalTokens, modelTier);
            const platformFee = TokenCalculator.calculatePlatformFee(muleAmount);

            // Prepare transaction data
            const transactionData = {
                timestamp: new Date(),
                transactionType,
                consumerId: new mongoose.Types.ObjectId(consumerId),
                model,
                modelType,
                modelTier,
                rawAmount: usage.totalTokens,
                muleAmount,
                platformFee,
                usage: {
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                    duration_seconds: performance.duration_seconds,
                    tokens_per_second: performance.tokens_per_second
                },
                metadata: {
                    request_success: usage.totalTokens > 0,
                    performance_metrics: {
                        tokens_per_second: performance.tokens_per_second,
                        duration_seconds: performance.duration_seconds,
                        timestamp: new Date()
                    }
                }
            };

            // Add provider ID if not self-service
            if (providerId && !isSelfService) {
                if (!mongoose.Types.ObjectId.isValid(providerId)) {
                    throw new Error('Invalid provider ID');
                }
                transactionData.providerId = new mongoose.Types.ObjectId(providerId);
            }

            // Create transaction record
            const transaction = await Transaction.create(transactionData);

            // Update provider's performance metrics if not self-service
            if (!isSelfService && providerId) {
                await this.updateProviderMetrics(providerId, {
                    tokens_per_second: performance.tokens_per_second,
                    duration_seconds: performance.duration_seconds,
                    total_tokens: usage.totalTokens,
                    success: usage.totalTokens > 0
                });
            }

            // Update balances for non-self-service transactions
            if (!isSelfService && muleAmount > 0) {
                await this._updateBalances(consumerId, providerId, muleAmount, platformFee);
            }

            return {
                transactionId: transaction._id,
                muleAmount,
                transactionType,
                performance: {
                    tokens_per_second: performance.tokens_per_second,
                    duration_seconds: performance.duration_seconds
                }
            };

        } catch (error) {
            console.error('Failed to process usage:', error);
            throw error;
        }
    }

    static async updateProviderMetrics(providerId, performance) {
        if (!providerId) return;

        try {
            const provider = await Provider.findOneAndUpdate(
                { userId: providerId },
                {
                    $push: {
                        'performance.history': {
                            timestamp: new Date(),
                            tokens_per_second: performance.tokens_per_second,
                            duration_seconds: performance.duration_seconds,
                            success: performance.success
                        }
                    },
                    $inc: {
                        'performance.total_requests': 1,
                        'performance.total_tokens': performance.total_tokens,
                        'performance.successful_requests': performance.success ? 1 : 0,
                        'performance.failed_requests': performance.success ? 0 : 1
                    },
                    $set: {
                        lastSeen: new Date()
                    }
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );

            // Keep only last 1000 performance records
            if (provider.performance.history.length > 1000) {
                await Provider.updateOne(
                    { userId: providerId },
                    { $pop: { 'performance.history': -1 } }
                );
            }

            return provider;
        } catch (error) {
            console.error('Error updating provider metrics:', error);
            throw error;
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

    static async getProviderStats(providerId, timeframe = '24h') {
        try {
            const startDate = new Date();
            switch(timeframe) {
                case '24h':
                    startDate.setHours(startDate.getHours() - 24);
                    break;
                case '7d':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case '30d':
                    startDate.setDate(startDate.getDate() - 30);
                    break;
                default:
                    startDate.setHours(startDate.getHours() - 24);
            }

            // Get both transaction stats and provider performance in parallel
            const [transactionStats, provider] = await Promise.all([
                Transaction.aggregate([
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
                            totalTokens: { $sum: '$usage.totalTokens' },
                            totalEarned: { $sum: '$muleAmount' },
                            avgTokensPerSecond: { $avg: '$usage.tokens_per_second' },
                            maxTokensPerSecond: { $max: '$usage.tokens_per_second' },
                            avgDurationSeconds: { $avg: '$usage.duration_seconds' },
                            successfulRequests: {
                                $sum: {
                                    $cond: [
                                        { $gt: ['$usage.totalTokens', 0] },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ]),
                Provider.findOne(
                    { userId: providerId },
                    { 
                        'performance.history': { $slice: -100 },
                        'performance.total_requests': 1,
                        'performance.successful_requests': 1,
                        'performance.failed_requests': 1,
                        'performance.total_tokens': 1
                    }
                )
            ]);

            // Get stats from transactions (last 24h)
            const recentStats = transactionStats[0] || {
                totalRequests: 0,
                totalTokens: 0,
                totalEarned: 0,
                avgTokensPerSecond: 0,
                maxTokensPerSecond: 0,
                avgDurationSeconds: 0,
                successfulRequests: 0
            };

            // Get stats from provider performance (all-time)
            const providerStats = {
                totalRequests: provider?.performance?.total_requests || 0,
                successfulRequests: provider?.performance?.successful_requests || 0,
                failedRequests: provider?.performance?.failed_requests || 0,
                totalTokens: provider?.performance?.total_tokens || 0,
                history: provider?.performance?.history || []
            };

            // Calculate success rate from recent transactions
            const recentSuccessRate = recentStats.totalRequests > 0
                ? ((recentStats.successfulRequests / recentStats.totalRequests) * 100)
                : 100;

            // Calculate performance metrics from recent history
            let recentPerformance = {
                avgTokensPerSecond: 0,
                maxTokensPerSecond: 0
            };

            if (providerStats.history.length > 0) {
                // Only consider successful requests for performance metrics
                const successfulHistory = providerStats.history.filter(h => h.success);
                if (successfulHistory.length > 0) {
                    recentPerformance = {
                        avgTokensPerSecond: Math.round(
                            successfulHistory.reduce((acc, curr) => acc + (curr.tokens_per_second || 0), 0) / 
                            successfulHistory.length
                        ),
                        maxTokensPerSecond: Math.round(
                            Math.max(...successfulHistory.map(h => h.tokens_per_second || 0))
                        )
                    };
                }
            }

            // Log stats for debugging
            console.log('Provider stats calculation:', {
                providerId,
                recentStats: {
                    totalRequests: recentStats.totalRequests,
                    successfulRequests: recentStats.successfulRequests,
                    successRate: recentSuccessRate
                },
                providerStats: {
                    totalRequests: providerStats.totalRequests,
                    successfulRequests: providerStats.successfulRequests,
                    failedRequests: providerStats.failedRequests
                },
                performance: recentPerformance
            });

            // Combine stats, preferring recent metrics when available
            return {
                totalRequests: providerStats.totalRequests,
                totalTokens: providerStats.totalTokens,
                totalEarned: recentStats.totalEarned,
                avgTokensPerSecond: recentPerformance.avgTokensPerSecond,
                maxTokensPerSecond: recentPerformance.maxTokensPerSecond,
                avgDurationSeconds: recentStats.avgDurationSeconds || 0,
                failedRequests: providerStats.failedRequests,
                successRate: recentSuccessRate
            };

        } catch (error) {
            console.error('Failed to get provider stats:', error);
            return {
                totalRequests: 0,
                totalTokens: 0,
                totalEarned: 0,
                avgTokensPerSecond: 0,
                maxTokensPerSecond: 0,
                avgDurationSeconds: 0,
                failedRequests: 0,
                successRate: 100
            };
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