const { body } = require('express-validator');

// User registration validation
exports.validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// User login validation
exports.validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Convert guest validation
exports.validateConvertGuest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

// Payment validation
exports.validatePayment = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least $1'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'BTC', 'ETH'])
    .withMessage('Invalid currency')
];

// Cart item validation
exports.validateCartItem = [
  body('country')
    .notEmpty()
    .withMessage('Country is required'),
  body('quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be between 1 and 1000'),
  body('pricePerProxy')
    .isFloat({ min: 0.01 })
    .withMessage('Price per proxy must be greater than 0')
];