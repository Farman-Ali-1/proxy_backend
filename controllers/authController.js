const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Register new user
// Register new user
exports.register = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed', 400, errors.array()));
  }

  const { email, password } = req.body;

  const existingUser = await User.findOne({ email, isGuest: false });
  if (existingUser) {
    return next(new AppError('User already exists with this email', 400));
  }

  const user = await User.create({
    email,
    password,
    isGuest: false
  });

  const token = generateToken(user._id);

  // Set JWT in cookie
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user
  });
});


// Login user
// Login user
exports.login = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed', 400, errors.array()));
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email, isGuest: false }).select('+password');
  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid email or password', 401));
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id);

  // Set JWT in cookie
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user
  });
});


// Create guest user
exports.createGuest = catchAsync(async (req, res, next) => {
  const guestToken = uuidv4();

  const guestUser = await User.create({
    isGuest: true,
    guestToken
  });

  // Set guest token in cookie
  res.cookie('guest_token', guestToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.json({
    success: true,
    message: 'Guest user created successfully',
    user: guestUser
  });
});

// Convert guest to regular user
exports.convertGuest = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed', 400, errors.array()));
  }

  const { email, password } = req.body;

  if (!req.user.isGuest) {
    return next(new AppError('User is not a guest', 400));
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email, isGuest: false });
  if (existingUser) {
    return next(new AppError('Email already exists', 400));
  }

  // Update guest user to regular user
  req.user.email = email;
  req.user.password = password;
  req.user.isGuest = false;
  req.user.guestToken = undefined;
  
  await req.user.save();

  const token = generateToken(req.user._id);

  // Clear guest token cookie
  res.clearCookie('guest_token');

  res.json({
    success: true,
    message: 'Guest user converted successfully',
    token,
    user: req.user
  });
});

// Get current user
exports.getMe = catchAsync(async (req, res, next) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Logout (mainly for clearing cookies)
exports.logout = catchAsync(async (req, res, next) => {
  res.clearCookie('guest_token');
  res.clearCookie('token');

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});
