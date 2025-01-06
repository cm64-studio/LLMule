// src/controllers/debugController.js
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');

class DebugController {
    static async getUserStats() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            activeLastDay,
            activeLastWeek,
            activeLastMonth,
            transactionStats
        ] = await Promise.all([
            User.countDocuments(),
            Transaction.distinct('consumerId', { timestamp: { $gte: oneDayAgo } }),
            Transaction.distinct('consumerId', { timestamp: { $gte: oneWeekAgo } }),
            Transaction.distinct('consumerId', { timestamp: { $gte: oneMonthAgo } }),
            Transaction.aggregate([
                {
                    $facet: {
                        last24h: [
                            { $match: { timestamp: { $gte: oneDayAgo } } },
                            { $group: { _id: null, count: { $sum: 1 }, totalMule: { $sum: "$muleAmount" } } }
                        ],
                        last7d: [
                            { $match: { timestamp: { $gte: oneWeekAgo } } },
                            { $group: { _id: null, count: { $sum: 1 }, totalMule: { $sum: "$muleAmount" } } }
                        ],
                        last30d: [
                            { $match: { timestamp: { $gte: oneMonthAgo } } },
                            { $group: { _id: null, count: { $sum: 1 }, totalMule: { $sum: "$muleAmount" } } }
                        ]
                    }
                }
            ])
        ]);

        const formatStats = (stats) => ({
            count: stats[0]?.count || 0,
            total_mule: Number((stats[0]?.totalMule || 0).toFixed(6))
        });

        return {
            total_users: totalUsers,
            active_users: {
                last_24h: activeLastDay.length,
                last_7d: activeLastWeek.length,
                last_30d: activeLastMonth.length
            },
            transactions: {
                last_24h: formatStats(transactionStats[0].last24h),
                last_7d: formatStats(transactionStats[0].last7d),
                last_30d: formatStats(transactionStats[0].last30d)
            },
            timestamp: new Date()
        };
    }
}

module.exports = DebugController;