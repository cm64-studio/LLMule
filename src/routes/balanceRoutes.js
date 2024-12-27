// routes/balanceRoutes.js
const express = require('express');
const router = express.Router();
const BalanceController = require('../controllers/balanceController');
const { authenticateApiKey } = require('../middleware/auth');
const { query } = require('express-validator');

// Route validations
const validateDateRange = [
  query('start').optional().isISO8601(),
  query('end').optional().isISO8601()
];

const validateTimeframe = [
  query('timeframe').optional().isIn(['7d', '30d', '90d', '1y'])
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

// Balance routes
router.get('/balance', 
  authenticateApiKey,
  BalanceController.getBalance
);

router.get('/transactions',
  authenticateApiKey,
  validatePagination,
  validateDateRange,
  BalanceController.getTransactionHistory
);

router.get('/provider/stats',
  authenticateApiKey,
  validateTimeframe,
  BalanceController.getProviderStats
);

router.get('/consumer/stats',
  authenticateApiKey,
  validateTimeframe,
  BalanceController.getConsumerStats
);

module.exports = router;