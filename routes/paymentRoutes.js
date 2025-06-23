const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { validatePayment } = require('../middleware/validation');

const router = express.Router();

// Public webhook route
router.post('/webhook', paymentController.handleWebhook);

// Protected routes
router.use(protect);

router.post('/create', validatePayment, paymentController.createPayment);
router.get('/status/:paymentId', paymentController.getPaymentStatus);

module.exports = router;