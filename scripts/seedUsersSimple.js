console.log('🚀 Script starting...');

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

console.log('📦 Imports loaded');

// Load environment variables
dotenv.config();
console.log('⚙️ Environment loaded');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple User schema without problematic indexes
const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  referrerAddress: {
    type: String,
    lowercase: true,
    default: null
  },
  deposits: [{
    amount: Number,
    txHash: String,
    blockNumber: Number,
    timestamp: Date
  }],
  registrationTime: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Only create essential indexes
userSchema.index({ walletAddress: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bdc');
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Transform MongoDB export format to our schema format
const transformUserData = (userData) => {
  return {
    walletAddress: userData.walletAddress.toLowerCase(),
    referrerAddress: userData.referrerAddress ? userData.referrerAddress.toLowerCase() : null,
    registrationTime: new Date(userData.registrationTime.$date),
    status: userData.status || 'active',
    deposits: userData.deposits.map(deposit => ({
      amount: deposit.amount,
      txHash: deposit.txHash,
      blockNumber: deposit.blockNumber,
      timestamp: new Date(deposit.timestamp.$date)
    }))
  };
};

// Clean and seed users function
const seedUsers = async () => {
  try {
    console.log('🌱 Starting user seeding process...');
    
    // Read the JSON file
    const jsonFilePath = path.join(__dirname, 'bdc_mlm.users.json');
    console.log('📁 Reading file from:', jsonFilePath);
    
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const usersData = JSON.parse(rawData);
    
    console.log(`📊 Found ${usersData.length} users to seed`);
    
    // First, drop the problematic collection and recreate it
    console.log('🧹 Dropping existing users collection...');
    try {
      await mongoose.connection.db.collection('users').drop();
      console.log('✅ Users collection dropped');
    } catch (error) {
      if (error.message.includes('ns not found')) {
        console.log('ℹ️ Users collection does not exist (first time setup)');
      } else {
        console.log('⚠️ Error dropping collection:', error.message);
      }
    }
    
    // Transform users data
    const transformedUsers = usersData.map(transformUserData);
    
    console.log('💾 Inserting users...');
    let successCount = 0;
    let errorCount = 0;
    
    // Insert users one by one to handle any remaining issues
    for (const userData of transformedUsers) {
      try {
        const newUser = new User(userData);
        await newUser.save();
        console.log(`✅ Added: ${userData.walletAddress}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error adding ${userData.walletAddress}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Seeding Results:`);
    console.log(`✅ Successfully added: ${successCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📊 Total processed: ${usersData.length} users`);
    
    // Display seeded users summary
    if (successCount > 0) {
      console.log('\n📋 Seeded Users Summary:');
      console.log('========================');
      
      const allUsers = await User.find({}).sort({ registrationTime: 1 });
      
      for (const user of allUsers) {
        const totalDeposits = user.deposits.reduce((sum, dep) => sum + dep.amount, 0);
        const depositCount = user.deposits.length;
        
        console.log(`👤 ${user.walletAddress}`);
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
      
      const rootUsers = allUsers.filter(u => !u.referrerAddress);
      
      for (const rootUser of rootUsers) {
        console.log(`🌟 Root: ${rootUser.walletAddress}`);
        showReferralTree(allUsers, rootUser.walletAddress, 1);
      }
    }
    
  } catch (error) {
    console.error('❌ Error seeding users:', error);
  }
};

// Helper function to show referral tree
const showReferralTree = (allUsers, parentAddress, level) => {
  const children = allUsers.filter(u => u.referrerAddress === parentAddress);
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const prefix = '  '.repeat(level) + (isLast ? '└── ' : '├── ');
    const totalDeposits = child.deposits.reduce((sum, dep) => sum + dep.amount, 0);
    
    console.log(`${prefix}Level ${level}: ${child.walletAddress} ($${totalDeposits})`);
    
    // Recursively show children (up to level 3 to avoid too much output)
    if (level < 3) {
      showReferralTree(allUsers, child.walletAddress, level + 1);
    }
  }
};

// Main execution
const main = async () => {
  try {
    console.log('🚀 Starting seeding script...');
    
    await connectDB();
    await seedUsers();
    
    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    console.log('🎉 Seeding process completed successfully!');
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
};

// Run the script
console.log('📋 BDC MLM Users Seeding Script');
console.log('================================');

// Add error handling for the main execution
main().then(() => {
  console.log('Script execution completed');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
