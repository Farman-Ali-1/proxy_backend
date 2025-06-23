const express = require('express');
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/', orderController.getOrders);
router.get('/stats', orderController.getOrderStats);
router.get('/:orderId', orderController.getOrderById);
router.patch('/:orderId/cancel', orderController.cancelOrder);

module.exports = router;