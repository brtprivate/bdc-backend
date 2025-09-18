import mongoose from 'mongoose';
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

// Check level data
const checkLevels = async () => {
  try {
    const mainReferrer = '0xc65ceba099dd9392bb324d700f7ff61ef2f38f1f';
    
    console.log(`🔍 Checking levels for: ${mainReferrer}`);
    
    // Get all level relationships
    const allLevels = await Level.find({
      referrerAddress: mainReferrer
    }).sort({ level: 1 });
    
    console.log(`📊 Total level relationships found: ${allLevels.length}`);
    
    for (const levelData of allLevels) {
      console.log(`\n📈 Level ${levelData.level}:`);
      console.log(`   User: ${levelData.userAddress}`);
      console.log(`   Investment: $${levelData.totalInvestment}`);
      console.log(`   Earnings: $${levelData.totalEarnings}`);
      console.log(`   Active: ${levelData.isActive}`);
      console.log(`   Registration: ${levelData.registrationTime}`);
    }
    
    // Check level counts
    for (let i = 1; i <= 5; i++) {
      const count = await Level.countDocuments({
        referrerAddress: mainReferrer,
        level: i
      });
      console.log(`\n📊 Level ${i}: ${count} users`);
    }
    
  } catch (error) {
    console.error('❌ Error checking levels:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await checkLevels();
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
  process.exit(0);
};

run();
