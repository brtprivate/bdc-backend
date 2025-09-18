// Direct MongoDB import without complex schemas
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bdc';

async function importUsers() {
  let client;
  
  try {
    console.log('🚀 Starting direct MongoDB import...');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('users');
    
    // Read JSON file
    const jsonPath = path.join(__dirname, 'bdc_mlm.users.json');
    console.log('📁 Reading file:', jsonPath);
    
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const usersData = JSON.parse(rawData);
    console.log(`📊 Found ${usersData.length} users`);
    
    // Drop existing collection to avoid index issues
    try {
      await collection.drop();
      console.log('🧹 Dropped existing users collection');
    } catch (error) {
      console.log('ℹ️ Collection does not exist (first time)');
    }
    
    // Transform data
    const transformedUsers = usersData.map(user => ({
      walletAddress: user.walletAddress.toLowerCase(),
      referrerAddress: user.referrerAddress ? user.referrerAddress.toLowerCase() : null,
      registrationTime: new Date(user.registrationTime.$date),
      status: user.status || 'active',
      deposits: user.deposits.map(deposit => ({
        amount: deposit.amount,
        txHash: deposit.txHash,
        blockNumber: deposit.blockNumber,
        timestamp: new Date(deposit.timestamp.$date)
      })),
      createdAt: new Date(user.createdAt.$date),
      updatedAt: new Date(user.updatedAt.$date)
    }));
    
    // Insert users
    console.log('💾 Inserting users...');
    const result = await collection.insertMany(transformedUsers);
    console.log(`✅ Successfully inserted ${result.insertedCount} users`);
    
    // Create only essential indexes
    console.log('🔧 Creating indexes...');
    await collection.createIndex({ walletAddress: 1 }, { unique: true });
    await collection.createIndex({ referrerAddress: 1 });
    await collection.createIndex({ status: 1 });
    console.log('✅ Indexes created');
    
    // Display results
    console.log('\n📋 Import Summary:');
    console.log('==================');
    
    const allUsers = await collection.find({}).sort({ registrationTime: 1 }).toArray();
    
    for (const user of allUsers) {
      const totalDeposits = user.deposits.reduce((sum, dep) => sum + dep.amount, 0);
      console.log(`👤 ${user.walletAddress}`);
      console.log(`   📍 Referrer: ${user.referrerAddress || 'None (Root)'}`);
      console.log(`   💰 Deposits: $${totalDeposits} (${user.deposits.length} transactions)`);
      console.log(`   📅 Registered: ${user.registrationTime.toLocaleDateString()}`);
      console.log('   ─────────────────────────────────────────');
    }
    
    // Show referral tree
    console.log('\n🌳 Referral Tree:');
    console.log('=================');
    
    const rootUsers = allUsers.filter(u => !u.referrerAddress);
    for (const rootUser of rootUsers) {
      console.log(`🌟 ${rootUser.walletAddress}`);
      showTree(allUsers, rootUser.walletAddress, 1);
    }
    
    console.log('\n🎉 Import completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Database connection closed');
    }
  }
}

function showTree(users, parentAddress, level) {
  const children = users.filter(u => u.referrerAddress === parentAddress);
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const prefix = '  '.repeat(level) + (isLast ? '└── ' : '├── ');
    const totalDeposits = child.deposits.reduce((sum, dep) => sum + dep.amount, 0);
    
    console.log(`${prefix}${child.walletAddress} ($${totalDeposits})`);
    
    if (level < 3) {
      showTree(users, child.walletAddress, level + 1);
    }
  }
}

// Run the import
importUsers();
