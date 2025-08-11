const winston = require('winston');
const path = require('path');
const fs = require('fs');
const colors = require('colors/safe');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure colors for different log levels
colors.setTheme({
  info: 'green',
  warn: 'yellow',
  error: 'red',
  debug: 'blue',
  silly: 'rainbow',
});

// Custom format for console output with colors
const colorizedFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  let coloredLevel;
  switch (level) {
    case 'error':
      coloredLevel = colors.error(`[${level.toUpperCase()}]`);
      break;
    case 'warn':
      coloredLevel = colors.warn(`[${level.toUpperCase()}]`);
      break;
    case 'info':
      coloredLevel = colors.info(`[${level.toUpperCase()}]`);
      break;
    case 'debug':
      coloredLevel = colors.debug(`[${level.toUpperCase()}]`);
      break;
    default:
      coloredLevel = `[${level.toUpperCase()}]`;
  }

  return `${colors.grey(timestamp)} ${coloredLevel}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

// Plain format for file logs (no colors)
const fileFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

// Define log format for console
const consoleFormat = winston.format.combine(winston.format.timestamp(), colorizedFormat);

// Define log format for files
const fileLogFormat = winston.format.combine(winston.format.timestamp(), fileFormat);

// Create base logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'whatsapp-service',
    environment: process.env.NODE_ENV,
  },
};

// Configure transports for local file and console logging
const transports = [
  // Console transport with colors
  new winston.transports.Console({
    format: consoleFormat,
  }),

  // File transports (no colors)
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileLogFormat,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileLogFormat,
  }),
];

// Create logger with configured transports
const logger = winston.createLogger({
  ...loggerConfig,
  transports,
});
logger.baileys = function (message, meta = {}) {
  this.debug(colors.cyan('[BAILEYS] ') + message, meta);
};

module.exports = logger;
