const CartItem = require('../models/CartItem');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Add item to cart
exports.addToCart = catchAsync(async (req, res, next) => {
  const { country, state, city, quantity, pricePerProxy, sessionType, ttl } = req.body;

  if (!country || !quantity || !pricePerProxy) {
    return next(new AppError('Country, quantity, and price are required', 400));
  }

  // Check if similar item already exists in cart
  const existingItem = await CartItem.findOne({
    user: req.user._id,
    country,
    state: state || null,
    city: city || null,
    sessionType: sessionType || 'sticky',
    ttl: ttl || 30
  });

  if (existingItem) {
    // Update quantity of existing item
    existingItem.quantity += parseInt(quantity);
    await existingItem.save();

    return res.json({
      success: true,
      message: 'Cart item updated',
      item: existingItem
    });
  }

  // Create new cart item
  const cartItem = await CartItem.create({
    user: req.user._id,
    country,
    state,
    city,
    quantity: parseInt(quantity),
    pricePerProxy: parseFloat(pricePerProxy),
    sessionType: sessionType || 'sticky',
    ttl: ttl || 30
  });

  res.status(201).json({
    success: true,
    message: 'Item added to cart',
    item: cartItem
  });
});

// Get cart items
exports.getCart = catchAsync(async (req, res, next) => {
  const cartItems = await CartItem.find({ user: req.user._id })
    .sort({ createdAt: -1 });

  const total = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);

  res.json({
    success: true,
    items: cartItems,
    total: parseFloat(total.toFixed(2)),
    count: cartItems.length
  });
});

// Update cart item
exports.updateCartItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    return next(new AppError('Valid quantity is required', 400));
  }

  const cartItem = await CartItem.findOneAndUpdate(
    { _id: itemId, user: req.user._id },
    { quantity: parseInt(quantity) },
    { new: true }
  );

  if (!cartItem) {
    return next(new AppError('Cart item not found', 404));
  }

  res.json({
    success: true,
    message: 'Cart item updated',
    item: cartItem
  });
});

// Remove item from cart
exports.removeFromCart = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;

  const cartItem = await CartItem.findOneAndDelete({
    _id: itemId,
    user: req.user._id
  });

  if (!cartItem) {
    return next(new AppError('Cart item not found', 404));
  }

  res.json({
    success: true,
    message: 'Item removed from cart'
  });
});

// Clear entire cart
exports.clearCart = catchAsync(async (req, res, next) => {
  await CartItem.deleteMany({ user: req.user._id });

  res.json({
    success: true,
    message: 'Cart cleared successfully'
  });
});