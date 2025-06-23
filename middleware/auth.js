const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Protect routes - require authentication
exports.protect = catchAsync(async (req, res, next) => {
  // Get token from header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Access token required', 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Check if user still exists
  const user = await User.findById(decoded.userId);
  if (!user) {
    return next(new AppError('User no longer exists', 401));
  }

  // Grant access to protected route
  req.user = user;
  next();
});

// Optional authentication - for guest users
exports.optionalAuth = catchAsync(async (req, res, next) => {
  // Try to get token from header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Try to get guest token from cookies
  const guestToken = req.cookies.guest_token;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Token invalid, continue without user
    }
  } else if (guestToken) {
    try {
      const user = await User.findOne({ guestToken });
      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Guest token invalid, continue without user
    }
  }

  next();
});

// Require authentication or guest user
exports.requireUser = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }
  next();
});