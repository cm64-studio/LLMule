const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const requestLoggerMiddleware = (req, res, next) => {
  // Generate unique request ID
  req.requestId = uuidv4();
  
  // Add timestamp for response time calculation
  req.startTime = Date.now();

  // Log the incoming request
  logger.request(req, {
    requestId: req.requestId,
    userId: req.user?._id
  });

  // Capture response using response event listener
  res.on('finish', () => {
    const responseTime = Date.now() - req.startTime;
    
    logger.response(req, res, responseTime, {
      requestId: req.requestId,
      userId: req.user?._id
    });

    // Log performance metrics for slow requests (>1000ms)
    if (responseTime > 1000) {
      logger.performance('slow-request', responseTime, {
        requestId: req.requestId,
        userId: req.user?._id,
        threshold: 1000
      });
    }
  });

  next();
};

module.exports = requestLoggerMiddleware; 