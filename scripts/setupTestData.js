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

// Setup test data
const setupTestData = async () => {
  try {
    console.log('🔧 Setting up test data...');
    
    // Create referrer user (0xC65Ceba099dD9392bb324d700F7fF61EF2F38f1F)
    const referrerAddress = '0xc65ceba099dd9392bb324d700f7ff61ef2f38f1f';
    
    let referrerUser = await User.findByWallet(referrerAddress);
    if (!referrerUser) {
      referrerUser = new User({
        walletAddress: referrerAddress,
        referrerAddress: null, // Top level user
        registrationTime: new Date(),
        status: 'active'
      });
      await referrerUser.save();
      console.log(`✅ Created referrer user: ${referrerAddress}`);
    } else {
      console.log(`ℹ️ Referrer user already exists: ${referrerAddress}`);
    }
    
    // Check existing referral
    const existingReferral = '0xa841371376190547e54c8fa72b0e684191e756c7';
    const referralUser = await User.findByWallet(existingReferral);
    
    if (referralUser) {
      console.log(`ℹ️ Found existing referral: ${existingReferral}`);
      
      // Create level 1 relationship
      const existingLevel = await Level.findOne({
        userAddress: existingReferral,
        referrerAddress: referrerAddress,
        level: 1
      });
      
      if (!existingLevel) {
        const levelData = new Level({
          userAddress: existingReferral,
          referrerAddress: referrerAddress,
          level: 1,
          totalInvestment: 1000, // $1000 test investment
          totalEarnings: 50, // $50 test earnings
          isActive: true,
          registrationTime: referralUser.registrationTime
        });
        
        await levelData.save();
        console.log(`✅ Created level 1 relationship: ${existingReferral} -> ${referrerAddress}`);
      } else {
        console.log(`ℹ️ Level 1 relationship already exists`);
      }
    }
    
    // Create some additional test users for levels 2-5
    const testUsers = [
      { address: '0x1111111111111111111111111111111111111111', referrer: existingReferral, level: 2 },
      { address: '0x2222222222222222222222222222222222222222', referrer: existingReferral, level: 2 },
      { address: '0x3333333333333333333333333333333333333333', referrer: '0x1111111111111111111111111111111111111111', level: 3 },
      { address: '0x4444444444444444444444444444444444444444', referrer: '0x2222222222222222222222222222222222222222', level: 3 },
      { address: '0x5555555555555555555555555555555555555555', referrer: '0x3333333333333333333333333333333333333333', level: 4 },
    ];
    
    for (const testUser of testUsers) {
      // Create user if doesn't exist
      let user = await User.findByWallet(testUser.address);
      if (!user) {
        user = new User({
          walletAddress: testUser.address,
          referrerAddress: testUser.referrer,
          registrationTime: new Date(),
          status: 'active'
        });
        await user.save();
        console.log(`✅ Created test user: ${testUser.address}`);
      }
      
      // Create level relationship with main referrer
      const existingLevel = await Level.findOne({
        userAddress: testUser.address,
        referrerAddress: referrerAddress,
        level: testUser.level
      });
      
      if (!existingLevel) {
        const levelData = new Level({
          userAddress: testUser.address,
          referrerAddress: referrerAddress,
          level: testUser.level,
          totalInvestment: Math.floor(Math.random() * 2000) + 500, // Random investment $500-$2500
          totalEarnings: Math.floor(Math.random() * 100) + 25, // Random earnings $25-$125
          isActive: true,
          registrationTime: user.registrationTime
        });
        
        await levelData.save();
        console.log(`✅ Created level ${testUser.level} relationship: ${testUser.address} -> ${referrerAddress}`);
      }
    }
    
    console.log('🎉 Test data setup completed!');
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await setupTestData();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

run();
