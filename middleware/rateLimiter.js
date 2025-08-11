/**
 * Rate Limiting Middleware
 * Provides protection against brute-force attacks and API abuse
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limiter configuration options
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000, // 1 minute by default
    max: process.env.RATE_LIMIT_MAX || 100, // 100 requests per window by default
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        windowMs: options.windowMs,
        max: options.max,
      });
      res.status(options.statusCode).json(options.message);
    },
  };

  return rateLimit({
    ...defaultOptions,
    ...options,
  });
};

module.exports = {
  createRateLimiter,
};
