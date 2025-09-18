import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Seed users function
const seedUsers = async () => {
  try {
    console.log('🌱 Starting user seeding process...');
    
    // Read the JSON file
    const jsonFilePath = path.join(__dirname, 'bdc_mlm.users.json');
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const usersData = JSON.parse(rawData);
    
    console.log(`📊 Found ${usersData.length} users to seed`);
    
    // Clear existing users (optional - comment out if you want to keep existing data)
    console.log('🧹 Clearing existing users...');
    await User.deleteMany({});
    console.log('✅ Existing users cleared');
    
    // Transform and insert users
    const transformedUsers = usersData.map(transformUserData);
    
    console.log('💾 Inserting users...');
    const insertedUsers = await User.insertMany(transformedUsers, { 
      ordered: false // Continue inserting even if some fail
    });
    
    console.log(`✅ Successfully seeded ${insertedUsers.length} users`);
    
    // Display seeded users summary
    console.log('\n📋 Seeded Users Summary:');
    console.log('========================');
    
    for (const user of insertedUsers) {
      const totalDeposits = user.getTotalDeposits();
      const depositCount = user.getDepositCount();
      
      console.log(`👤 ${user.walletAddress}`);
      console.log(`   📍 Referrer: ${user.referrerAddress || 'None'}`);
      console.log(`   💰 Total Deposits: $${totalDeposits}`);
      console.log(`   📊 Deposit Count: ${depositCount}`);
      console.log(`   📅 Registered: ${user.registrationTime.toLocaleDateString()}`);
      console.log(`   ✅ Status: ${user.status}`);
      console.log('   ─────────────────────────────────────────────────');
    }
    
    // Create referral tree summary
    console.log('\n🌳 Referral Tree Summary:');
    console.log('=========================');
    
    const rootUsers = await User.find({ referrerAddress: null });
    const allUsers = await User.find({});
    
    for (const rootUser of rootUsers) {
      console.log(`🌟 Root: ${rootUser.walletAddress}`);
      
      const directReferrals = allUsers.filter(u => 
        u.referrerAddress === rootUser.walletAddress
      );
      
      for (const referral of directReferrals) {
        console.log(`  ├── Level 1: ${referral.walletAddress}`);
        
        const level2Referrals = allUsers.filter(u => 
          u.referrerAddress === referral.walletAddress
        );
        
        for (const level2 of level2Referrals) {
          console.log(`  │   └── Level 2: ${level2.walletAddress}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    
    if (error.code === 11000) {
      console.error('💡 Duplicate key error - some users may already exist');
      console.error('   Consider using upsert operations or clearing existing data first');
    }
  }
};

// Alternative function to seed without clearing existing data
const seedUsersWithoutClearing = async () => {
  try {
    console.log('🌱 Starting user seeding process (preserving existing data)...');
    
    // Read the JSON file
    const jsonFilePath = path.join(__dirname, 'bdc_mlm.users.json');
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const usersData = JSON.parse(rawData);
    
    console.log(`📊 Found ${usersData.length} users to seed`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Insert users one by one to handle duplicates gracefully
    for (const userData of usersData) {
      try {
        const transformedUser = transformUserData(userData);
        
        // Check if user already exists
        const existingUser = await User.findOne({ 
          walletAddress: transformedUser.walletAddress 
        });
        
        if (existingUser) {
          console.log(`⏭️  Skipping existing user: ${transformedUser.walletAddress}`);
          skipCount++;
          continue;
        }
        
        // Create new user
        const newUser = new User(transformedUser);
        await newUser.save();
        
        console.log(`✅ Added user: ${transformedUser.walletAddress}`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error adding user ${userData.walletAddress}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Seeding Results:');
    console.log('===================');
    console.log(`✅ Successfully added: ${successCount} users`);
    console.log(`⏭️  Skipped existing: ${skipCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📊 Total processed: ${usersData.length} users`);
    
  } catch (error) {
    console.error('❌ Error in seeding process:', error);
  }
};

// Main execution
const main = async () => {
  try {
    console.log('🚀 Starting seeding script...');

    await connectDB();

    // Get command line argument to determine seeding method
    const args = process.argv.slice(2);
    const preserveExisting = args.includes('--preserve') || args.includes('-p');

    if (preserveExisting) {
      console.log('🔒 Preserve mode: Existing users will be kept');
      await seedUsersWithoutClearing();
    } else {
      console.log('🧹 Clear mode: Existing users will be removed');
      await seedUsers();
    }

    // Close connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    console.log('🎉 Seeding process completed!');

  } catch (error) {
    console.error('💥 Fatal error in main:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Run the script
console.log('📋 Script started with args:', process.argv.slice(2));
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});
