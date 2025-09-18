// Simple import script using existing server setup
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Simple import script started');

try {
  // Read the JSON file
  const jsonFilePath = path.join(__dirname, 'bdc_mlm.users.json');
  console.log('📁 Reading file from:', jsonFilePath);
  
  const rawData = fs.readFileSync(jsonFilePath, 'utf8');
  const usersData = JSON.parse(rawData);
  
  console.log(`📊 Found ${usersData.length} users in JSON file`);
  
  // Display the users
  usersData.forEach((user, index) => {
    console.log(`${index + 1}. 👤 ${user.walletAddress}`);
    console.log(`   📍 Referrer: ${user.referrerAddress || 'None'}`);
    console.log(`   💰 Deposits: ${user.deposits.length}`);
    console.log(`   📅 Registered: ${user.registrationTime.$date}`);
    console.log('   ─────────────────────────────────────────');
  });
  
  console.log('✅ File read successfully');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
