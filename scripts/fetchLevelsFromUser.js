import mongoose from 'mongoose';
import User from '../models/User.js';
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

// Fetch all levels using only User model
const fetchLevelsFromUser = async (referrerAddress) => {
  try {
    console.log(`🔍 Fetching levels for: ${referrerAddress}`);
    
    const levels = {};
    let totalInvestment = 0;
    let totalUsers = 0;
    
    // Function to get users at a specific level
    const getUsersAtLevel = async (currentReferrer, targetLevel, currentLevel = 1) => {
      if (currentLevel > 21) return [];
      
      // Get direct referrals of current referrer
      const directReferrals = await User.find({
        referrerAddress: currentReferrer.toLowerCase(),
        status: 'active'
      });
      
      let usersAtThisLevel = [];
      
      if (currentLevel === targetLevel) {
        // We found users at the target level
        for (const user of directReferrals) {
          // Get investment data for this user
          const investments = await Investment.find({
            userAddress: user.walletAddress
          });
          
          const userInvestment = investments.reduce((sum, inv) => sum + inv.amount, 0);
          
          usersAtThisLevel.push({
            walletAddress: user.walletAddress,
            registrationTime: user.registrationTime,
            totalInvestment: userInvestment,
            depositCount: user.deposits.length,
            status: user.status
          });
        }
      } else {
        // Go deeper to find users at target level
        for (const user of directReferrals) {
          const deeperUsers = await getUsersAtLevel(user.walletAddress, targetLevel, currentLevel + 1);
          usersAtThisLevel = usersAtThisLevel.concat(deeperUsers);
        }
      }
      
      return usersAtThisLevel;
    };
    
    // Get users for each level (1 to 21)
    for (let level = 1; level <= 21; level++) {
      const usersAtLevel = await getUsersAtLevel(referrerAddress, level);
      levels[`level${level}`] = usersAtLevel;
      
      const levelInvestment = usersAtLevel.reduce((sum, user) => sum + user.totalInvestment, 0);
      totalInvestment += levelInvestment;
      totalUsers += usersAtLevel.length;
      
      console.log(`📊 Level ${level}: ${usersAtLevel.length} users, $${levelInvestment} investment`);
      
      // Show user details for non-empty levels
      if (usersAtLevel.length > 0) {
        usersAtLevel.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.walletAddress}`);
          console.log(`      💰 Investment: $${user.totalInvestment}`);
          console.log(`      📅 Registered: ${user.registrationTime.toISOString().split('T')[0]}`);
          console.log(`      📈 Deposits: ${user.depositCount}`);
        });
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   Total Investment: $${totalInvestment}`);
    console.log(`   Active Levels: ${Object.values(levels).filter(level => level.length > 0).length}`);
    
    return {
      referrerAddress,
      levels,
      totalUsers,
      totalInvestment,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('❌ Error fetching levels:', error);
    return null;
  }
};

// Run the script
const run = async () => {
  await connectDB();
  
  const referrerAddress = '0xC65Ceba099dD9392bb324d700F7fF61EF2F38f1F';
  const result = await fetchLevelsFromUser(referrerAddress);
  
  if (result) {
    console.log('\n🎉 Level fetching completed successfully!');
  }
  
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
  process.exit(0);
};

run();
