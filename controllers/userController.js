const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Get user profile
exports.getProfile = catchAsync(async (req, res, next) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Update user profile
exports.updateProfile = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, country } = req.body;

  // Update profile fields
  if (firstName !== undefined) req.user.profile.firstName = firstName;
  if (lastName !== undefined) req.user.profile.lastName = lastName;
  if (phone !== undefined) req.user.profile.phone = phone;
  if (country !== undefined) req.user.profile.country = country;

  await req.user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: req.user
  });
});

// Get transaction history
exports.getTransactions = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, type, status } = req.query;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = { user: req.user._id };
  if (type) filter.type = type;
  if (status) filter.status = status;

  const transactions = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .populate('user', 'email');

  const total = await Transaction.countDocuments(filter);

  res.json({
    success: true,
    transactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// Get user statistics
exports.getStats = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const stats = await Transaction.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const totalSpent = await Transaction.aggregate([
    { 
      $match: { 
        user: userId, 
        type: 'purchase', 
        status: 'completed' 
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const totalTopup = await Transaction.aggregate([
    { 
      $match: { 
        user: userId, 
        type: 'topup', 
        status: 'completed' 
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  res.json({
    success: true,
    stats: {
      currentBalance: req.user.balance,
      totalSpent: totalSpent[0]?.total || 0,
      totalTopup: totalTopup[0]?.total || 0,
      transactionBreakdown: stats
    }
  });
});

// Update user balance (internal function)
exports.updateBalance = async (userId, amount, type, description, metadata = {}) => {
  const session = await User.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Update user balance
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: amount } },
        { new: true, session }
      );

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Create transaction record
      await Transaction.create([{
        user: userId,
        amount,
        type,
        status: 'completed',
        description,
        metadata
      }], { session });

      return user;
    });
  } finally {
    await session.endSession();
  }
};