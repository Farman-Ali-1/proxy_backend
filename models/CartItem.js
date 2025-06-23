const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  country: {
    type: String,
    required: true
  },
  state: {
    type: String
  },
  city: {
    type: String
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  pricePerProxy: {
    type: Number,
    required: true,
    min: 0
  },
  sessionType: {
    type: String,
    enum: ['sticky', 'rotating'],
    default: 'sticky'
  },
  ttl: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },
  totalPrice: {
    type: Number
  }
}, {
  timestamps: true
});

// Calculate total price before saving
cartItemSchema.pre('save', function(next) {
  this.totalPrice = this.quantity * this.pricePerProxy;
  next();
});

// Index for performance
cartItemSchema.index({ user: 1 });

module.exports = mongoose.model('CartItem', cartItemSchema);