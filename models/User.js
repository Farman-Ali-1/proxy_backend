const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    sparse: true, // Allows null values to be non-unique
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    minlength: 6
  },
  balance: {
    type: Number,
    default: 0.0,
    min: 0
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  guestToken: {
    type: String,
    unique: true,
    sparse: true
  },
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    country: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ guestToken: 1 });
userSchema.index({ isGuest: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Transform output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', userSchema);