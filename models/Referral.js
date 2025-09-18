import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  // User who made the referral (upline)
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  referrerAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  
  // User who was referred (downline)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  userAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  
  // Level in the referral hierarchy (1-21)
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 21,
    index: true
  },
  
  // Registration details
  registrationTxHash: {
    type: String,
    required: true
  },
  
  blockNumber: {
    type: Number,
    required: true
  },
  
  // Status tracking
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Investment tracking for this referral relationship
  totalInvestmentByUser: {
    type: Number,
    default: 0
  },
  
  // Income generated from this referral
  totalIncomeGenerated: {
    type: Number,
    default: 0
  },
  
  // Commission earned by referrer from this user
  commissionEarned: {
    type: Number,
    default: 0
  },
  
  // Commission rate at the time of referral
  commissionRate: {
    type: Number,
    default: 0 // Percentage
  },
  
  // Path from root to this referral (for quick traversal)
  referralPath: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    level: Number,
    address: String
  }],
  
  // Additional metadata
  metadata: {
    registrationDate: {
      type: Date,
      default: Date.now
    },
    lastActivityDate: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      default: 'direct' // direct, bulk_import, migration
    }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for commission percentage based on level
referralSchema.virtual('defaultCommissionRate').get(function() {
  // Define commission rates for each level (you can customize these)
  const commissionRates = {
    1: 10,   // Level 1: 10%
    2: 5,    // Level 2: 5%
    3: 3,    // Level 3: 3%
    4: 2,    // Level 4: 2%
    5: 1,    // Level 5: 1%
    6: 1,    // Level 6: 1%
    7: 1,    // Level 7: 1%
    8: 0.5,  // Level 8: 0.5%
    9: 0.5,  // Level 9: 0.5%
    10: 0.5, // Level 10: 0.5%
    11: 0.3, // Level 11: 0.3%
    12: 0.3, // Level 12: 0.3%
    13: 0.3, // Level 13: 0.3%
    14: 0.2, // Level 14: 0.2%
    15: 0.2, // Level 15: 0.2%
    16: 0.2, // Level 16: 0.2%
    17: 0.1, // Level 17: 0.1%
    18: 0.1, // Level 18: 0.1%
    19: 0.1, // Level 19: 0.1%
    20: 0.1, // Level 20: 0.1%
    21: 0.1  // Level 21: 0.1%
  };
  
  return commissionRates[this.level] || 0;
});

// Instance methods
referralSchema.methods.updateInvestment = function(amount) {
  this.totalInvestmentByUser += amount;
  this.metadata.lastActivityDate = new Date();
  return this.save();
};

referralSchema.methods.addCommission = function(amount) {
  this.commissionEarned += amount;
  this.totalIncomeGenerated += amount;
  this.metadata.lastActivityDate = new Date();
  return this.save();
};

referralSchema.methods.buildReferralPath = async function() {
  const path = [];
  let currentUser = await mongoose.model('User').findById(this.referrer);
  let currentLevel = 1;
  
  while (currentUser && currentLevel <= 21) {
    path.push({
      user: currentUser._id,
      level: currentLevel,
      address: currentUser.walletAddress
    });
    
    if (currentUser.referrer) {
      currentUser = await mongoose.model('User').findById(currentUser.referrer);
      currentLevel++;
    } else {
      break;
    }
  }
  
  this.referralPath = path;
  return path;
};

// Static methods
referralSchema.statics.findByLevel = function(level, options = {}) {
  const query = { level, isActive: true };
  
  if (options.referrer) {
    query.referrer = options.referrer;
  }
  
  return this.find(query)
    .populate('referrer', 'walletAddress totalEarnings')
    .populate('user', 'walletAddress totalInvestment isActive')
    .sort({ createdAt: -1 });
};

referralSchema.statics.getLevelStatistics = function(level) {
  return this.aggregate([
    { $match: { level, isActive: true } },
    {
      $group: {
        _id: null,
        totalReferrals: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestmentByUser' },
        totalCommissions: { $sum: '$commissionEarned' },
        averageInvestment: { $avg: '$totalInvestmentByUser' },
        averageCommission: { $avg: '$commissionEarned' }
      }
    }
  ]);
};

referralSchema.statics.getAllLevelsStatistics = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$level',
        totalReferrals: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestmentByUser' },
        totalCommissions: { $sum: '$commissionEarned' },
        averageInvestment: { $avg: '$totalInvestmentByUser' },
        averageCommission: { $avg: '$commissionEarned' }
      }
    },
    { $sort: { _id: 1 } } // Sort by level
  ]);
};

referralSchema.statics.getUserReferralTree = function(userId, maxLevel = 21) {
  return this.aggregate([
    { $match: { referrer: userId, level: { $lte: maxLevel } } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },
    { $unwind: '$userDetails' },
    {
      $group: {
        _id: '$level',
        users: {
          $push: {
            userId: '$user',
            address: '$userAddress',
            investment: '$totalInvestmentByUser',
            commission: '$commissionEarned',
            isActive: '$userDetails.isActive',
            joinDate: '$createdAt'
          }
        },
        totalUsers: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestmentByUser' },
        totalCommissions: { $sum: '$commissionEarned' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

referralSchema.statics.getTopReferrers = function(level, limit = 10) {
  return this.aggregate([
    { $match: { level, isActive: true } },
    {
      $group: {
        _id: '$referrer',
        totalReferrals: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestmentByUser' },
        totalCommissions: { $sum: '$commissionEarned' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'referrerDetails'
      }
    },
    { $unwind: '$referrerDetails' },
    {
      $project: {
        referrerAddress: '$referrerDetails.walletAddress',
        totalReferrals: 1,
        totalInvestment: 1,
        totalCommissions: 1,
        referrerTotalEarnings: '$referrerDetails.totalEarnings'
      }
    },
    { $sort: { totalCommissions: -1 } },
    { $limit: limit }
  ]);
};

// Compound indexes for better performance
referralSchema.index({ referrer: 1, level: 1 });
referralSchema.index({ user: 1, level: 1 });
referralSchema.index({ level: 1, isActive: 1 });
// referralSchema.index({ referrerAddress: 1, level: 1 });
referralSchema.index({ userAddress: 1 });
referralSchema.index({ createdAt: -1 });
referralSchema.index({ blockNumber: 1 });

const Referral = mongoose.model('Referral', referralSchema);

export default Referral;
