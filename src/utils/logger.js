// src/utils/logger.js
const winston = require('winston');
const { format } = winston;
const chalk = require('chalk');
require('winston-daily-rotate-file');

// Helper function to format numbers
const formatNumber = (num) => {
  if (num < 0.0001) return num.toExponential(4);
  return num.toFixed(6);
};

// Helper function to format duration
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms/1000).toFixed(2)}s`;
};

// Custom console format for better UX
const consoleFormat = format.printf(({ level, message, timestamp, type, error, stack, ...metadata }) => {
  // Server startup message
  if (message.includes('Server started')) {
    return `\n${chalk.bold.cyan('╔════ LLMule Server ══════════════════════')}
${chalk.bold.cyan('║')} ${chalk.green('🚀')} ${chalk.bold('Status:')} ${chalk.green('Online')}
${chalk.bold.cyan('║')} ${chalk.bold('Endpoints:')}
${chalk.bold.cyan('║')}   ${chalk.blue('•')} Local:    ${chalk.white(`http://localhost:${metadata.port}`)}
${chalk.bold.cyan('║')}   ${chalk.blue('•')} Network:  ${chalk.white(`http://${metadata.host}:${metadata.port}`)}
${chalk.bold.cyan('║')}
${chalk.bold.cyan('║')} ${chalk.blue('🔌')} WebSocket: ${chalk.white(metadata.websocketPath)}
${chalk.bold.cyan('║')} ${chalk.yellow('🌍')} Environment: ${chalk.white(metadata.environment || 'development')}
${chalk.bold.cyan('╚════════════════════════════════════')}\n`;
  }

  // MongoDB connection
  if (message.includes('Connected to MongoDB')) {
    return `${chalk.green('📦')} ${chalk.bold('Database:')} ${chalk.green('Connected successfully')}`;
  }

  // Enhanced error formatting
  if (level === 'error') {
    return `\n${chalk.red.bold('╔════ ERROR ══════════════════')}
${chalk.red.bold('║')} ${chalk.red(message)}
${error ? `${chalk.red.bold('║')} ${chalk.gray(error)}\n` : ''}${stack ? `${chalk.red.bold('║')} ${chalk.gray(stack)}\n` : ''}${metadata.requestId ? `${chalk.red.bold('║')} RequestID: ${chalk.yellow(metadata.requestId)}\n` : ''}${chalk.red.bold('╚══════════════════════════')}\n`;
  }

  // WebSocket events
  if (message.includes('WebSocket')) {
    return `${chalk.blue('🔌')} ${chalk.gray(timestamp)} ${message}`;
  }

  // Performance logs
  if (type === 'performance') {
    const duration = metadata.duration_ms;
    const color = duration > 1000 ? chalk.yellow : chalk.green;
    return `${color('⚡')} ${message} ${color(`(${formatDuration(duration)})`)}`;
  }

  // Transaction logs
  if (message.includes('Processing usage') || message.includes('Creating transaction')) {
    const tokens = metadata.usage?.total_tokens || metadata.usage?.totalTokens;
    const muleAmount = metadata.muleAmount || 0;
    return `${chalk.yellow('💰')} Transaction: ${tokens} tokens (${formatNumber(muleAmount)} MULE)`;
  }

  // Balance updates
  if (message.includes('balance updated')) {
    return `${chalk.green('💳')} Balance: ${chalk.bold(formatNumber(metadata.newBalance))} MULE`;
  }

  // API Requests
  if (type === 'request') {
    return `${chalk.blue('→')} ${chalk.bold(metadata.method)} ${metadata.url}`;
  }

  // API Responses
  if (type === 'response') {
    const color = metadata.statusCode < 400 ? chalk.green : chalk.red;
    const icon = metadata.statusCode < 400 ? '✓' : '✗';
    const duration = formatDuration(metadata.responseTime);
    return `${color(`${icon}`)} ${chalk.bold(metadata.method)} ${metadata.url} ${color(`[${metadata.statusCode}]`)} ${chalk.gray(duration)}`;
  }

  // Model selection logs
  if (message.includes('Selected provider')) {
    const models = metadata.models?.join(', ') || 'none';
    return `${chalk.blue('🤖')} Selected model: ${chalk.bold(models)}`;
  }

  // Default formatting with improved timestamp
  const levelColors = {
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.blue,
    debug: chalk.gray
  };

  const colorize = levelColors[level] || chalk.white;
  return `${chalk.gray(timestamp)} ${colorize(level.toUpperCase())} ${message}`;
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'llmule-api' },
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.timestamp({ format: 'HH:mm:ss' }),
        format.errors({ stack: true }),
        consoleFormat
      )
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(
        format.uncolorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.json()
      )
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(
        format.uncolorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.json()
      )
    })
  ]
});

// Add request context tracking
const requestLogger = {
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  error: (message, meta = {}) => {
    if (meta.error instanceof Error) {
      meta = {
        ...meta,
        error: meta.error.message,
        stack: meta.error.stack
      };
    }
    logger.error(message, meta);
  },
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  // Performance monitoring
  performance: (operation, duration, meta = {}) => {
    logger.info(`Performance - ${operation}`, {
      ...meta,
      duration_ms: duration,
      type: 'performance'
    });
  },
  // API request logging
  request: (req, meta = {}) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
      ...meta,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      type: 'request'
    });
  },
  // API response logging
  response: (req, res, responseTime, meta = {}) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
      ...meta,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      type: 'response'
    });
  }
};

module.exports = requestLogger;