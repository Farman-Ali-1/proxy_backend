const express = require('express');
const authController = require('../controllers/authController');
const { protect, optionalAuth } = require('../middleware/auth');
const { validateRegister, validateLogin, validateConvertGuest } = require('../middleware/validation');

const router = express.Router();

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/guest', authController.createGuest);
router.post('/logout', authController.logout);

// Protected routes
router.post('/convert-guest', protect, validateConvertGuest, authController.convertGuest);
router.get('/me', protect, authController.getMe);

module.exports = router;