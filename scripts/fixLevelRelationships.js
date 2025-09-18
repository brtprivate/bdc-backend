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

// Fix level relationships for the referral chain
const fixLevelRelationships = async () => {
  try {
    console.log('🔧 Fixing level relationships...');
    
    // The referral chain:
    // 0xc65ceba099dd9392bb324d700f7ff61ef2f38f1f (Main Referrer)
    //   ↓ Level 1
    // 0xa841371376190547e54c8fa72b0e684191e756c7 
    //   ↓ Level 2  
    // 0x6ccb225ef69e91c5d2432c19d39d838119b8cb5d
    
    const mainReferrer = '0xc65ceba099dd9392bb324d700f7ff61ef2f38f1f';
    const level1User = '0xa841371376190547e54c8fa72b0e684191e756c7';
    const level2User = '0x6ccb225ef69e91c5d2432c19d39d838119b8cb5d';
    
    // Get user data
    const level1UserData = await User.findByWallet(level1User);
    const level2UserData = await User.findByWallet(level2User);
    
    if (!level1UserData || !level2UserData) {
      console.error('❌ Users not found in database');
      return;
    }
    
    console.log(`📊 Level 1 User: ${level1User}`);
    console.log(`   Referrer: ${level1UserData.referrerAddress}`);
    console.log(`   Registration: ${level1UserData.registrationTime}`);
    
    console.log(`📊 Level 2 User: ${level2User}`);
    console.log(`   Referrer: ${level2UserData.referrerAddress}`);
    console.log(`   Registration: ${level2UserData.registrationTime}`);
    
    // Clear existing level relationships for clean start
    await Level.deleteMany({
      referrerAddress: mainReferrer
    });
    console.log('🧹 Cleared existing level relationships');
    
    // Create Level 1 relationship (level1User -> mainReferrer)
    const level1Relation = new Level({
      userAddress: level1User,
      referrerAddress: mainReferrer,
      level: 1,
      totalInvestment: 1000, // From the investment we recorded
      totalEarnings: 0,
      isActive: true,
      registrationTime: level1UserData.registrationTime
    });
    
    await level1Relation.save();
    console.log(`✅ Created Level 1 relationship: ${level1User} -> ${mainReferrer}`);
    
    // Create Level 2 relationship (level2User -> mainReferrer)
    const level2Relation = new Level({
      userAddress: level2User,
      referrerAddress: mainReferrer,
      level: 2,
      totalInvestment: 0, // No investment yet
      totalEarnings: 0,
      isActive: true,
      registrationTime: level2UserData.registrationTime
    });
    
    await level2Relation.save();
    console.log(`✅ Created Level 2 relationship: ${level2User} -> ${mainReferrer}`);
    
    // Verify the relationships
    const level1Count = await Level.countDocuments({
      referrerAddress: mainReferrer,
      level: 1
    });
    
    const level2Count = await Level.countDocuments({
      referrerAddress: mainReferrer,
      level: 2
    });
    
    console.log(`📊 Verification:`);
    console.log(`   Level 1 users: ${level1Count}`);
    console.log(`   Level 2 users: ${level2Count}`);
    
    console.log('🎉 Level relationships fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing level relationships:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await fixLevelRelationships();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

run();
