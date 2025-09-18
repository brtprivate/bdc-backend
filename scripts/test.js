console.log('🚀 Test script started');
console.log('📋 Node.js version:', process.version);
console.log('📁 Current directory:', process.cwd());
console.log('📋 Arguments:', process.argv.slice(2));

try {
  console.log('📦 Testing imports...');
  
  // Test basic imports
  import('mongoose').then(() => {
    console.log('✅ Mongoose import successful');
  }).catch(err => {
    console.error('❌ Mongoose import failed:', err.message);
  });
  
  import('fs').then(() => {
    console.log('✅ FS import successful');
  }).catch(err => {
    console.error('❌ FS import failed:', err.message);
  });
  
  import('dotenv').then(() => {
    console.log('✅ Dotenv import successful');
  }).catch(err => {
    console.error('❌ Dotenv import failed:', err.message);
  });
  
  console.log('🎉 Test completed');
  
} catch (error) {
  console.error('💥 Test error:', error);
}
