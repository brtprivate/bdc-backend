import mongoose from 'mongoose';

const investmentSchema = new mongoose.Schema({
  // User wallet address
  userAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  
  // Investment amount
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Transaction details
  txHash: {
    type: String,
    required: true,
    unique: true
  },

  blockNumber: {
    type: Number,
    required: true
  },
  
  // Investment type
  type: {
    type: String,
    enum: ['USDT', 'BDC'],
    default: 'USDT'
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'confirmed'
  },
  
  // Investment time
  investmentTime: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true
});

// Instance methods
investmentSchema.methods.confirm = function() {
  this.status = 'confirmed';
  return this.save();
};

investmentSchema.methods.fail = function() {
  this.status = 'failed';
  return this.save();
};

// Static methods
investmentSchema.statics.getUserInvestments = function(userAddress) {
  return this.find({ 
    userAddress: userAddress.toLowerCase(),
    status: 'confirmed'
  }).sort({ investmentTime: -1 });
};

investmentSchema.statics.getUserTotalInvestment = function(userAddress) {
  return this.aggregate([
    { 
      $match: { 
        userAddress: userAddress.toLowerCase(),
        status: 'confirmed'
      } 
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalInvestments: { $sum: 1 },
        averageAmount: { $avg: '$amount' },
        lastInvestment: { $max: '$investmentTime' }
      }
    }
  ]);
};

investmentSchema.statics.getAllInvestmentsStatistics = function() {
  return this.aggregate([
    { $match: { status: 'confirmed' } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalInvestments: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userAddress' },
        averageAmount: { $avg: '$amount' },
        maxAmount: { $max: '$amount' },
        minAmount: { $min: '$amount' }
      }
    },
    {
      $project: {
        totalAmount: 1,
        totalInvestments: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' },
        averageAmount: 1,
        maxAmount: 1,
        minAmount: 1
      }
    }
  ]);
};

investmentSchema.statics.getTopInvestors = function(limit = 10) {
  return this.aggregate([
    { $match: { status: 'confirmed' } },
    {
      $group: {
        _id: '$userAddress',
        totalInvestment: { $sum: '$amount' },
        totalInvestments: { $sum: 1 },
        lastInvestment: { $max: '$investmentTime' }
      }
    },
    { $sort: { totalInvestment: -1 } },
    { $limit: limit }
  ]);
};

investmentSchema.statics.getDailyInvestmentReport = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        investmentTime: { $gte: startDate },
        status: 'confirmed'
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$investmentTime' },
          month: { $month: '$investmentTime' },
          day: { $dayOfMonth: '$investmentTime' }
        },
        totalAmount: { $sum: '$amount' },
        totalInvestments: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userAddress' }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        totalAmount: 1,
        totalInvestments: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// Indexes for better performance
investmentSchema.index({ userAddress: 1, status: 1 });
investmentSchema.index({ txHash: 1 }, { unique: true });
investmentSchema.index({ blockNumber: 1 });
investmentSchema.index({ investmentTime: -1 });
investmentSchema.index({ amount: -1 });
investmentSchema.index({ status: 1 });

const Investment = mongoose.model('Investment', investmentSchema);

export default Investment;
