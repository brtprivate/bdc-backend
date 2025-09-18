console.log('Hello World!');
console.log('Node.js version:', process.version);
console.log('Current directory:', process.cwd());

// Test file reading
const fs = require('fs');
const path = require('path');

try {
  const jsonPath = path.join(__dirname, 'bdc_mlm.users.json');
  console.log('Trying to read:', jsonPath);
  
  const data = fs.readFileSync(jsonPath, 'utf8');
  const users = JSON.parse(data);
  console.log('Successfully read', users.length, 'users');
  
  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.walletAddress}`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
}
