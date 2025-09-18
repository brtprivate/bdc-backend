import mongoose from 'mongoose';

const incomeSchema = new mongoose.Schema({
  // User who received the income
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  userAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  
  // Source of income
  sourceUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  sourceUserAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  
  // Income details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  type: {
    type: String,
    required: true,
    enum: [
      'direct_referral',    // Direct referral commission
      'level_commission',   // Level-based commission
      'royalty',           // Royalty income
      'bonus',             // Special bonuses
      'matching',          // Matching bonuses
      'leadership',        // Leadership bonuses
      'pool_share',        // Pool sharing
      'rank_achievement'   // Rank achievement rewards
    ],
    index: true
  },
  
  // Level information (for level commissions)
  level: {
    type: Number,
    min: 1,
    max: 21,
    index: true
  },
  
  // Commission rate applied
  commissionRate: {
    type: Number,
    default: 0 // Percentage
  },
  
  // Transaction details
  transactionHash: {
    type: String,
    default: null
  },
  
  blockNumber: {
    type: Number,
    default: null
  },
  
  // Investment that generated this income
  sourceInvestment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investment',
    default: null
  },
  
  sourceInvestmentAmount: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'paid', 'cancelled'],
    default: 'confirmed',
    index: true
  },
  
  // Payment details
  paymentDate: {
    type: Date,
    default: null
  },
  
  paymentTxHash: {
    type: String,
    default: null
  },
  
  // Additional metadata
  metadata: {
    calculatedAt: {
      type: Date,
      default: Date.now
    },
    description: String,
    notes: String,
    source: {
      type: String,
      default: 'contract_event' // contract_event, manual, bonus, etc.
    }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted amount
incomeSchema.virtual('formattedAmount').get(function() {
  return parseFloat(this.amount.toFixed(6));
});

// Virtual for income description
incomeSchema.virtual('description').get(function() {
  switch(this.type) {
    case 'direct_referral':
      return `Direct referral commission from ${this.sourceUserAddress}`;
    case 'level_commission':
      return `Level ${this.level} commission from ${this.sourceUserAddress}`;
    case 'royalty':
      return `Royalty income from ${this.sourceUserAddress}`;
    case 'bonus':
      return `Bonus income from ${this.sourceUserAddress}`;
    default:
      return `${this.type} income from ${this.sourceUserAddress}`;
  }
});

// Instance methods
incomeSchema.methods.markAsPaid = function(txHash) {
  this.status = 'paid';
  this.paymentDate = new Date();
  this.paymentTxHash = txHash;
  return this.save();
};

incomeSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.metadata.notes = reason;
  return this.save();
};

// Static methods
incomeSchema.statics.getUserTotalIncome = function(userId, options = {}) {
  const match = { user: userId, status: { $in: ['confirmed', 'paid'] } };
  
  if (options.type) {
    match.type = options.type;
  }
  
  if (options.level) {
    match.level = options.level;
  }
  
  if (options.dateFrom) {
    match.createdAt = { $gte: options.dateFrom };
  }
  
  if (options.dateTo) {
    match.createdAt = { ...match.createdAt, $lte: options.dateTo };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    }
  ]);
};

incomeSchema.statics.getUserIncomeByType = function(userId) {
  return this.aggregate([
    { 
      $match: { 
        user: userId, 
        status: { $in: ['confirmed', 'paid'] } 
      } 
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        averageAmount: { $avg: '$amount' },
        lastTransaction: { $max: '$createdAt' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

incomeSchema.statics.getUserIncomeByLevel = function(userId) {
  return this.aggregate([
    { 
      $match: { 
        user: userId, 
        status: { $in: ['confirmed', 'paid'] },
        level: { $exists: true, $ne: null }
      } 
    },
    {
      $group: {
        _id: '$level',
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        averageAmount: { $avg: '$amount' },
        lastTransaction: { $max: '$createdAt' }
      }
    },
    { $sort: { _id: 1 } } // Sort by level
  ]);
};

incomeSchema.statics.getLevelIncomeStatistics = function(level) {
  return this.aggregate([
    { 
      $match: { 
        level, 
        status: { $in: ['confirmed', 'paid'] } 
      } 
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' },
        averageAmount: { $avg: '$amount' },
        maxAmount: { $max: '$amount' },
        minAmount: { $min: '$amount' }
      }
    },
    {
      $project: {
        totalAmount: 1,
        totalTransactions: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' },
        averageAmount: 1,
        maxAmount: 1,
        minAmount: 1
      }
    }
  ]);
};

incomeSchema.statics.getAllLevelsIncomeStatistics = function() {
  return this.aggregate([
    { 
      $match: { 
        status: { $in: ['confirmed', 'paid'] },
        level: { $exists: true, $ne: null }
      } 
    },
    {
      $group: {
        _id: '$level',
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $project: {
        level: '$_id',
        totalAmount: 1,
        totalTransactions: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' },
        averageAmount: 1
      }
    },
    { $sort: { level: 1 } }
  ]);
};

incomeSchema.statics.getTopEarners = function(limit = 10, timeframe = null) {
  const match = { status: { $in: ['confirmed', 'paid'] } };
  
  if (timeframe) {
    match.createdAt = { $gte: timeframe };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$user',
        totalEarnings: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        lastEarning: { $max: '$createdAt' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    {
      $project: {
        userAddress: '$userDetails.walletAddress',
        totalEarnings: 1,
        totalTransactions: 1,
        lastEarning: 1,
        directReferrals: '$userDetails.directReferrals'
      }
    },
    { $sort: { totalEarnings: -1 } },
    { $limit: limit }
  ]);
};

incomeSchema.statics.getDailyIncomeReport = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        createdAt: { $gte: startDate },
        status: { $in: ['confirmed', 'paid'] }
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalAmount: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$user' }
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
        totalTransactions: 1,
        uniqueUsersCount: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// Indexes for better performance
incomeSchema.index({ user: 1, type: 1 });
incomeSchema.index({ user: 1, level: 1 });
incomeSchema.index({ user: 1, status: 1 });
incomeSchema.index({ sourceUser: 1 });
incomeSchema.index({ level: 1, status: 1 });
incomeSchema.index({ type: 1, status: 1 });
incomeSchema.index({ createdAt: -1 });
incomeSchema.index({ amount: -1 });
incomeSchema.index({ blockNumber: 1 });

const Income = mongoose.model('Income', incomeSchema);

export default Income;
