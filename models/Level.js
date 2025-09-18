import mongoose from 'mongoose';

const levelSchema = new mongoose.Schema({
  // User wallet address
  userAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  
  // Referrer wallet address (upline)
  referrerAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  
  // Level in the hierarchy (1-21)
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 21,
    index: true
  },
  
  // Investment made by this user
  totalInvestment: {
    type: Number,
    default: 0
  },
  
  // Earnings generated from this level relationship
  totalEarnings: {
    type: Number,
    default: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Registration time
  registrationTime: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true
});

// Instance methods
levelSchema.methods.addInvestment = function(amount) {
  this.totalInvestment += amount;
  return this.save();
};

levelSchema.methods.addEarnings = function(amount) {
  this.totalEarnings += amount;
  return this.save();
};

// Static methods
levelSchema.statics.getLevelStatistics = function(level) {
  return this.aggregate([
    { $match: { level, isActive: true } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestment' },
        totalEarnings: { $sum: '$totalEarnings' },
        averageInvestment: { $avg: '$totalInvestment' },
        averageEarnings: { $avg: '$totalEarnings' }
      }
    }
  ]);
};

levelSchema.statics.getAllLevelsStatistics = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$level',
        totalUsers: { $sum: 1 },
        totalInvestment: { $sum: '$totalInvestment' },
        totalEarnings: { $sum: '$totalEarnings' },
        averageInvestment: { $avg: '$totalInvestment' },
        averageEarnings: { $avg: '$totalEarnings' }
      }
    },
    { $sort: { _id: 1 } } // Sort by level
  ]);
};

levelSchema.statics.getUserLevels = function(userAddress) {
  return this.find({ 
    referrerAddress: userAddress.toLowerCase(),
    isActive: true 
  }).sort({ level: 1 });
};

levelSchema.statics.getReferrersByLevel = function(level) {
  return this.find({ 
    level,
    isActive: true 
  }).sort({ totalEarnings: -1 });
};

// Compound indexes for better performance
levelSchema.index({ userAddress: 1, level: 1 });
levelSchema.index({ referrerAddress: 1, level: 1 });
levelSchema.index({ level: 1, isActive: 1 });
levelSchema.index({ totalEarnings: -1 });
levelSchema.index({ totalInvestment: -1 });
levelSchema.index({ registrationTime: -1 });

const Level = mongoose.model('Level', levelSchema);

export default Level;
