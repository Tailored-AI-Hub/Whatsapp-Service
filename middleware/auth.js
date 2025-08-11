/**
 * Authentication Middleware
 * Handles JWT token validation and role-based access control
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Validate JWT token and extract user information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = (req, res, next) => {
  try {
    // Skip auth in development mode if configured
    // Default to 'true' if SKIP_AUTH is not defined in environment variables
    if (process.env.SKIP_AUTH === 'true' || process.env.SKIP_AUTH === undefined) {
      req.user = { id: 'dev-user', role: 'admin' };
      return next();
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    return res.status(401).json({ success: false, message: 'Invalid authentication' });
  }
};

/**
 * Check if user has admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  next();
};

module.exports = {
  authenticate,
  requireAdmin,
};
