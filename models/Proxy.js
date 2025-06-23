const mongoose = require('mongoose');

const proxySchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ip: {
    type: String,
    required: true
  },
  port: {
    type: Number,
    required: true
  },
  username: {
    type: String
  },
  password: {
    type: String
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
  sessionType: {
    type: String,
    enum: ['sticky', 'rotating'],
    default: 'sticky'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  trafficLeft: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'disabled', 'suspended'],
    default: 'active'
  },
  lastUsed: {
    type: Date
  },
  totalTrafficUsed: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
proxySchema.index({ user: 1, status: 1 });
proxySchema.index({ order: 1 });
proxySchema.index({ expiresAt: 1 });
proxySchema.index({ status: 1 });

// Check if proxy is expired
proxySchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Update status based on expiration
proxySchema.pre('find', function() {
  this.where({ expiresAt: { $gt: new Date() } });
});

module.exports = mongoose.model('Proxy', proxySchema);