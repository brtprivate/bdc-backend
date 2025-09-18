import mongoose from 'mongoose';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/bdc_mlm');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Reset to real data only
const resetToRealData = async () => {
  try {
    console.log('🔄 Resetting to real data only...');
    
    // Clear all level relationships (they will be recreated when real investments happen)
    const deletedLevels = await Level.deleteMany({});
    console.log(`✅ Deleted ${deletedLevels.deletedCount} level relationships`);
    
    // Clear all investments (only real blockchain investments should exist)
    const deletedInvestments = await Investment.deleteMany({});
    console.log(`✅ Deleted ${deletedInvestments.deletedCount} investment records`);
    
    // Keep users but reset their deposits array
    const users = await User.find({});
    for (const user of users) {
      user.deposits = [];
      user.totalDeposits = 0;
      await user.save();
      console.log(`🔄 Reset deposits for user: ${user.walletAddress}`);
    }
    
    console.log('📊 Current database state:');
    const userCount = await User.countDocuments();
    const levelCount = await Level.countDocuments();
    const investmentCount = await Investment.countDocuments();
    
    console.log(`👥 Users: ${userCount}`);
    console.log(`📈 Level relationships: ${levelCount}`);
    console.log(`💰 Investments: ${investmentCount}`);
    
    console.log('🎉 Database reset to real data only!');
    console.log('ℹ️ Level relationships will be created automatically when users make real investments.');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await resetToRealData();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

run();
