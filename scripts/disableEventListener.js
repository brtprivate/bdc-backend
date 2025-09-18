import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to disable event listener in server.js
function disableEventListener() {
  try {
    const serverPath = path.join(__dirname, '..', 'server.js');
    let content = fs.readFileSync(serverPath, 'utf8');
    
    // Comment out the event listener import and start
    content = content.replace(
      /import { startEventListener } from '\.\/services\/eventListener\.js';/g,
      '// import { startEventListener } from \'./services/eventListener.js\';'
    );
    
    content = content.replace(
      /await startEventListener\(\);/g,
      '// await startEventListener(); // Disabled to prevent RPC rate limiting'
    );
    
    fs.writeFileSync(serverPath, content);
    console.log('✅ Event listener disabled in server.js');
    
    return true;
  } catch (error) {
    console.error('❌ Error disabling event listener:', error.message);
    return false;
  }
}

// Function to enable event listener in server.js
function enableEventListener() {
  try {
    const serverPath = path.join(__dirname, '..', 'server.js');
    let content = fs.readFileSync(serverPath, 'utf8');
    
    // Uncomment the event listener import and start
    content = content.replace(
      /\/\/ import { startEventListener } from '\.\/services\/eventListener\.js';/g,
      'import { startEventListener } from \'./services/eventListener.js\';'
    );
    
    content = content.replace(
      /\/\/ await startEventListener\(\); \/\/ Disabled to prevent RPC rate limiting/g,
      'await startEventListener();'
    );
    
    fs.writeFileSync(serverPath, content);
    console.log('✅ Event listener enabled in server.js');
    
    return true;
  } catch (error) {
    console.error('❌ Error enabling event listener:', error.message);
    return false;
  }
}

// Main execution
const action = process.argv[2];

console.log('🔧 Event Listener Control Script');
console.log('================================');

if (action === 'disable') {
  console.log('🛑 Disabling event listener...');
  if (disableEventListener()) {
    console.log('✅ Event listener has been disabled');
    console.log('ℹ️ This will prevent RPC rate limiting errors');
    console.log('ℹ️ Restart the server for changes to take effect');
  }
} else if (action === 'enable') {
  console.log('🎧 Enabling event listener...');
  if (enableEventListener()) {
    console.log('✅ Event listener has been enabled');
    console.log('ℹ️ Restart the server for changes to take effect');
  }
} else {
  console.log('Usage:');
  console.log('  node scripts/disableEventListener.js disable  - Disable event listener');
  console.log('  node scripts/disableEventListener.js enable   - Enable event listener');
  console.log('');
  console.log('Current status: Check server.js for commented/uncommented event listener code');
}
