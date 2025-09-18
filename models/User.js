import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // User wallet address (unique identifier)
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  // Referrer wallet address
  referrerAddress: {
    type: String,
    lowercase: true,
    default: null
  },

  // User deposits array
  deposits: [{
    amount: {
      type: Number,
      
    },
    txHash: {
      type: String,
      required: true
    },
    blockNumber: {
      type: Number,

    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Registration time
  registrationTime: {
    type: Date,
    default: Date.now
  },

  // User status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }

}, {
  timestamps: true
});

// Instance methods
userSchema.methods.addDeposit = function(amount, txHash, blockNumber) {
  this.deposits.push({
    amount,
    txHash,
    blockNumber,
    timestamp: new Date()
  });
  return this.save();
};

userSchema.methods.getTotalDeposits = function() {
  return this.deposits.reduce((total, deposit) => total + deposit.amount, 0);
};

userSchema.methods.getDepositCount = function() {
  return this.deposits.length;
};

// Static methods
userSchema.statics.findByWallet = function(walletAddress) {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

userSchema.statics.getAllUsers = function() {
  return this.find({ status: 'active' }).sort({ registrationTime: -1 });
};

userSchema.statics.getUsersByReferrer = function(referrerAddress) {
  return this.find({
    referrerAddress: referrerAddress.toLowerCase(),
    status: 'active'
  }).sort({ registrationTime: -1 });
};

// Indexes
userSchema.index({ walletAddress: 1 }, { unique: true });
userSchema.index({ referrerAddress: 1 }); // Critical for team queries
userSchema.index({ status: 1 });
userSchema.index({ registrationTime: -1 });
// Compound indexes for better performance
userSchema.index({ referrerAddress: 1, status: 1 });
userSchema.index({ status: 1, registrationTime: -1 });

const User = mongoose.model('User', userSchema);

export default User;
