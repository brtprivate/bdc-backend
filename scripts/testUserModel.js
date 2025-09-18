import mongoose from 'mongoose';
import User from '../models/User.js';
import Level from '../models/Level.js';

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

// Test User model
const testUserModel = async () => {
  try {
    console.log('🧪 Testing User model...');
    
    // Test 1: Get all users
    const allUsers = await User.find({});
    console.log(`📊 Total users in database: ${allUsers.length}`);
    
    for (const user of allUsers) {
      console.log(`\n👤 User: ${user.walletAddress}`);
      console.log(`   Referrer: ${user.referrerAddress || 'None'}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Registration: ${user.registrationTime}`);
      console.log(`   Deposits: ${user.deposits.length}`);
    }
    
    // Test 2: Test findByWallet method
    const mainReferrer = '0xc65ceba099dd9392bb324d700f7ff61ef2f38f1f';
    const user1 = await User.findByWallet(mainReferrer);
    
    if (user1) {
      console.log(`\n✅ Found main referrer: ${user1.walletAddress}`);
      
      // Test 3: Get users by referrer
      const referrals = await User.getUsersByReferrer(mainReferrer);
      console.log(`📈 Direct referrals: ${referrals.length}`);
      
      for (const referral of referrals) {
        console.log(`   → ${referral.walletAddress}`);
      }
    } else {
      console.log(`❌ Main referrer not found: ${mainReferrer}`);
    }
    
    // Test 4: Check Level collection
    console.log(`\n🔍 Checking Level collection...`);
    const allLevels = await Level.find({});
    console.log(`📊 Total level records: ${allLevels.length}`);
    
    for (const level of allLevels) {
      console.log(`   Level ${level.level}: ${level.userAddress} -> ${level.referrerAddress}`);
    }
    
    // Test 5: Try to create level relationships manually
    console.log(`\n🔧 Creating level relationships manually...`);
    
    const level1User = '0xa841371376190547e54c8fa72b0e684191e756c7';
    const level2User = '0x6ccb225ef69e91c5d2432c19d39d838119b8cb5d';
    
    // Check if users exist
    const user1Data = await User.findByWallet(level1User);
    const user2Data = await User.findByWallet(level2User);
    
    console.log(`Level 1 user exists: ${!!user1Data}`);
    console.log(`Level 2 user exists: ${!!user2Data}`);
    
    if (user1Data && user2Data) {
      // Clear existing levels
      await Level.deleteMany({});
      console.log('🧹 Cleared existing levels');
      
      // Create level 1
      const level1 = new Level({
        userAddress: level1User,
        referrerAddress: mainReferrer,
        level: 1,
        totalInvestment: 1000,
        totalEarnings: 0,
        isActive: true,
        registrationTime: user1Data.registrationTime
      });
      
      await level1.save();
      console.log('✅ Created Level 1 relationship');
      
      // Create level 2
      const level2 = new Level({
        userAddress: level2User,
        referrerAddress: mainReferrer,
        level: 2,
        totalInvestment: 0,
        totalEarnings: 0,
        isActive: true,
        registrationTime: user2Data.registrationTime
      });
      
      await level2.save();
      console.log('✅ Created Level 2 relationship');
      
      // Verify
      const levelCount = await Level.countDocuments({});
      console.log(`📊 Total levels created: ${levelCount}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing User model:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await testUserModel();
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
  process.exit(0);
};

run();
