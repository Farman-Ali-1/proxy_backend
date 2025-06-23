const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/profile', userController.getProfile);
router.patch('/profile', userController.updateProfile);
router.get('/transactions', userController.getTransactions);
router.get('/stats', userController.getStats);

module.exports = router;