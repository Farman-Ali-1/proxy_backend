const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const { updateBalance } = require('./userController');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Create Cryptomus payment
exports.createPayment = catchAsync(async (req, res, next) => {
  const { amount, currency = 'USD' } = req.body;

  if (!amount || amount < 1) {
    return next(new AppError('Valid amount is required (minimum $1)', 400));
  }

  const orderId = `topup_${req.user._id}_${Date.now()}`;

  // Create pending transaction
  const transaction = await Transaction.create({
    user: req.user._id,
    amount: parseFloat(amount),
    type: 'topup',
    status: 'pending',
    paymentId: orderId,
    description: `Balance top-up of ${amount} ${currency}`,
    metadata: {
      currency,
      paymentMethod: 'cryptomus'
    }
  });

  try {
    // Prepare Cryptomus payment data
    const paymentData = {
      amount: amount.toString(),
      currency,
      order_id: orderId,
      url_callback: `${req.protocol}://${req.get('host')}/api/payment/webhook`,
      url_return: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      url_cancel: `${process.env.FRONTEND_URL}/dashboard?payment=cancel`,
      is_payment_multiple: false,
      lifetime: 7200, // 2 hours
      // to_currency: currency
    };

    // Create signature
    const dataString = Buffer.from(JSON.stringify(paymentData)).toString('base64');
    const sign = crypto
      .createHash('md5')
      .update(dataString + process.env.CRYPTOMUS_API_KEY)
      .digest('hex');

    // Call Cryptomus API
    const response = await fetch('https://api.cryptomus.com/v1/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant': process.env.CRYPTOMUS_MERCHANT_ID,
        'sign': sign
      },
      body: JSON.stringify(paymentData)
    });

    const result = await response.json();

    if (result.state === 0) {
      res.json({
        success: true,
        paymentUrl: result.result.url,
        paymentId: orderId,
        amount: parseFloat(amount),
        currency,
        expiresAt: new Date(Date.now() + 7200000) // 2 hours
      });
    } else {
      // Mark transaction as failed
      transaction.status = 'failed';
      await transaction.save();
      
      return next(new AppError(result.message || 'Payment creation failed', 400));
    }
  } catch (error) {
    // Mark transaction as failed
    transaction.status = 'failed';
    await transaction.save();
    
    console.error('Cryptomus API error:', error);
    return next(new AppError('Payment service error', 500));
  }
});

// Handle Cryptomus webhook
exports.handleWebhook = catchAsync(async (req, res, next) => {
  const data = req.body;

  // Verify webhook signature
  const dataString = Buffer.from(JSON.stringify(data)).toString('base64');
  const expectedSign = crypto
    .createHash('md5')
    .update(dataString + process.env.CRYPTOMUS_API_KEY)
    .digest('hex');

  const receivedSign = req.headers['sign'];

  if (expectedSign !== receivedSign) {
    console.error('Invalid webhook signature');
    return next(new AppError('Invalid signature', 400));
  }

  const { order_id, status, amount, currency } = data;

  // Find transaction
  const transaction = await Transaction.findOne({ paymentId: order_id });
  if (!transaction) {
    console.error('Transaction not found:', order_id);
    return next(new AppError('Transaction not found', 404));
  }

  if (status === 'paid' || status === 'paid_over') {
    // Update transaction status
    transaction.status = 'completed';
    await transaction.save();

    // Update user balance
    await updateBalance(
      transaction.user,
      parseFloat(amount),
      'topup',
      `Balance top-up completed: ${amount} ${currency}`,
      {
        currency,
        paymentMethod: 'cryptomus',
        paymentId: order_id
      }
    );

    console.log(`Balance updated for user ${transaction.user}: +${amount} ${currency}`);
  } else if (status === 'cancel' || status === 'fail') {
    // Update transaction as failed
    transaction.status = 'failed';
    await transaction.save();
  }

  res.json({ success: true });
});

// Get payment status
exports.getPaymentStatus = catchAsync(async (req, res, next) => {
  const { paymentId } = req.params;

  const transaction = await Transaction.findOne({
    paymentId,
    user: req.user._id
  });

  if (!transaction) {
    return next(new AppError('Payment not found', 404));
  }

  res.json({
    success: true,
    payment: {
      paymentId,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.metadata.currency,
      createdAt: transaction.createdAt
    }
  });
});