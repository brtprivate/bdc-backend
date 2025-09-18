import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bdc', {
      // Remove deprecated options
    });
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Check users function
const checkUsers = async () => {
  try {
    console.log('👥 Checking current users in database...\n');
    
    const users = await User.find({}).sort({ registrationTime: 1 });
    
    if (users.length === 0) {
      console.log('📭 No users found in database');
      return;
    }
    
    console.log(`📊 Found ${users.length} users in database\n`);
    console.log('👥 Users List:');
    console.log('==============');
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const totalDeposits = user.getTotalDeposits();
      const depositCount = user.getDepositCount();
      
      console.log(`${i + 1}. 👤 ${user.walletAddress}`);
      console.log(`   📍 Referrer: ${user.referrerAddress || 'None (Root User)'}`);
      console.log(`   💰 Total Deposits: $${totalDeposits}`);
      console.log(`   📊 Deposit Count: ${depositCount}`);
      console.log(`   📅 Registered: ${user.registrationTime.toLocaleDateString()}`);
      console.log(`   ✅ Status: ${user.status}`);
      console.log('   ─────────────────────────────────────────────────');
    }
    
    // Show referral tree
    console.log('\n🌳 Referral Tree:');
    console.log('=================');
    
    const rootUsers = users.filter(u => !u.referrerAddress);
    
    if (rootUsers.length === 0) {
      console.log('🔍 No root users found (all users have referrers)');
    } else {
      for (const rootUser of rootUsers) {
        console.log(`🌟 Root: ${rootUser.walletAddress}`);
        showReferralTree(users, rootUser.walletAddress, 1);
      }
    }
    
    // Show statistics
    console.log('\n📈 Statistics:');
    console.log('==============');
    console.log(`👥 Total Users: ${users.length}`);
    console.log(`🌟 Root Users: ${rootUsers.length}`);
    console.log(`🔗 Users with Referrers: ${users.length - rootUsers.length}`);
    
    const totalDeposits = users.reduce((sum, user) => sum + user.getTotalDeposits(), 0);
    const totalDepositCount = users.reduce((sum, user) => sum + user.getDepositCount(), 0);
    
    console.log(`💰 Total Deposits: $${totalDeposits}`);
    console.log(`📊 Total Deposit Transactions: ${totalDepositCount}`);
    console.log(`📊 Average Deposits per User: $${(totalDeposits / users.length).toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error checking users:', error);
  }
};

// Helper function to show referral tree recursively
const showReferralTree = (allUsers, parentAddress, level) => {
  const children = allUsers.filter(u => u.referrerAddress === parentAddress);
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const prefix = '  '.repeat(level) + (isLast ? '└── ' : '├── ');
    
    console.log(`${prefix}Level ${level}: ${child.walletAddress} ($${child.getTotalDeposits()})`);
    
    // Recursively show children (up to level 5 to avoid too much output)
    if (level < 5) {
      showReferralTree(allUsers, child.walletAddress, level + 1);
    }
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await checkUsers();
  
  // Close connection
  await mongoose.connection.close();
  console.log('\n🔌 Database connection closed');
};

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
