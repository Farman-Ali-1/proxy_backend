const express = require('express');
const cartController = require('../controllers/cartController');
const { optionalAuth, requireUser } = require('../middleware/auth');
const { validateCartItem } = require('../middleware/validation');

const router = express.Router();

// Apply optional auth to all routes
router.use(optionalAuth);

router.get('/', cartController.getCart);
router.post('/add', requireUser, validateCartItem, cartController.addToCart);
router.put('/:itemId', requireUser, cartController.updateCartItem);
router.delete('/:itemId', requireUser, cartController.removeFromCart);
router.delete('/', requireUser, cartController.clearCart);

module.exports = router;