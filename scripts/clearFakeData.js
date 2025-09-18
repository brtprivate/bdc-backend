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

// Clear fake data and keep only real data
const clearFakeData = async () => {
  try {
    console.log('🧹 Clearing fake test data...');
    
    // Remove fake test users (addresses with all 1s, 2s, etc.)
    const fakeAddresses = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555'
    ];
    
    // Remove fake users
    const deletedUsers = await User.deleteMany({
      walletAddress: { $in: fakeAddresses }
    });
    console.log(`✅ Deleted ${deletedUsers.deletedCount} fake users`);
    
    // Remove fake level relationships
    const deletedLevels = await Level.deleteMany({
      $or: [
        { userAddress: { $in: fakeAddresses } },
        { referrerAddress: { $in: fakeAddresses } }
      ]
    });
    console.log(`✅ Deleted ${deletedLevels.deletedCount} fake level relationships`);
    
    // Remove fake investments
    const deletedInvestments = await Investment.deleteMany({
      userAddress: { $in: fakeAddresses }
    });
    console.log(`✅ Deleted ${deletedInvestments.deletedCount} fake investments`);
    
    // Now let's check what real data we have
    const realUsers = await User.find({});
    console.log(`📊 Real users in database: ${realUsers.length}`);
    
    for (const user of realUsers) {
      console.log(`👤 User: ${user.walletAddress}, Referrer: ${user.referrerAddress || 'None'}`);
      
      // Check investments for this user
      const investments = await Investment.find({ userAddress: user.walletAddress });
      console.log(`  💰 Investments: ${investments.length}`);
      
      // Check level relationships
      const levels = await Level.find({ referrerAddress: user.walletAddress });
      console.log(`  📈 Level relationships: ${levels.length}`);
    }
    
    console.log('🎉 Fake data cleared! Only real data remains.');
    
  } catch (error) {
    console.error('❌ Error clearing fake data:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await clearFakeData();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

run();
