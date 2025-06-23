const Order = require('../models/Order');
const Proxy = require('../models/Proxy');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Get user orders
exports.getOrders = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .populate('user', 'email');

  const total = await Order.countDocuments(filter);

  // Add proxy count for each order
  const ordersWithProxyCount = await Promise.all(
    orders.map(async (order) => {
      const proxyCount = await Proxy.countDocuments({ order: order._id });
      return {
        ...order.toObject(),
        proxyCount
      };
    })
  );

  res.json({
    success: true,
    orders: ordersWithProxyCount,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// Get specific order details
exports.getOrderById = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    user: req.user._id
  }).populate('user', 'email');

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Get proxies for this order
  const proxies = await Proxy.find({ order: orderId }).sort({ createdAt: -1 });

  res.json({
    success: true,
    order: {
      ...order.toObject(),
      proxies
    }
  });
});

// Get order statistics
exports.getOrderStats = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const stats = await Order.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  const totalOrders = await Order.countDocuments({ user: userId });
  const completedOrders = await Order.countDocuments({ user: userId, status: 'completed' });
  const totalSpent = await Order.aggregate([
    { $match: { user: userId, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);

  const activeProxies = await Proxy.countDocuments({
    user: userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  res.json({
    success: true,
    stats: {
      totalOrders,
      completedOrders,
      totalSpent: totalSpent[0]?.total || 0,
      activeProxies,
      statusBreakdown: stats
    }
  });
});

// Cancel order (if still pending)
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    user: req.user._id
  });

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  if (order.status !== 'pending' && order.status !== 'processing') {
    return next(new AppError('Cannot cancel order in current status', 400));
  }

  order.status = 'cancelled';
  await order.save();

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    order
  });
});