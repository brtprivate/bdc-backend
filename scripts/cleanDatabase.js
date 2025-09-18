import mongoose from 'mongoose';

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

// Clean database
const cleanDatabase = async () => {
  try {
    console.log('🧹 Cleaning database...');
    
    const db = mongoose.connection.db;
    
    // Drop problematic index
    try {
      await db.collection('users').dropIndex('referralCode_1');
      console.log('✅ Dropped referralCode_1 index');
    } catch (error) {
      console.log('ℹ️ referralCode_1 index not found or already dropped');
    }
    
    // List all indexes
    const indexes = await db.collection('users').indexes();
    console.log('📋 Current indexes:', indexes.map(idx => idx.name));
    
    console.log('🎉 Database cleaned!');
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
  }
};

// Run the script
const run = async () => {
  await connectDB();
  await cleanDatabase();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

run();
