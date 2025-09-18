import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to clean console.log statements that contain @TODO
function cleanTodoLogs(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Remove lines that contain @TODO Error
    const lines = content.split('\n');
    const cleanedLines = lines.filter(line => {
      if (line.includes('@TODO Error') || line.includes('console.log') && line.includes('@TODO')) {
        console.log(`Removing TODO log from ${filePath}: ${line.trim()}`);
        modified = true;
        return false;
      }
      return true;
    });
    
    if (modified) {
      fs.writeFileSync(filePath, cleanedLines.join('\n'));
      console.log(`✅ Cleaned ${filePath}`);
    }
    
    return modified;
  } catch (error) {
    console.error(`❌ Error cleaning ${filePath}:`, error.message);
    return false;
  }
}

// Function to recursively find and clean JavaScript files
function cleanDirectory(dirPath, extensions = ['.js', '.ts']) {
  let totalCleaned = 0;
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .git directories
        if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
          totalCleaned += cleanDirectory(fullPath, extensions);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          if (cleanTodoLogs(fullPath)) {
            totalCleaned++;
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dirPath}:`, error.message);
  }
  
  return totalCleaned;
}

// Main execution
console.log('🧹 Starting log cleanup...');

const backendDir = path.join(__dirname, '..');
const totalCleaned = cleanDirectory(backendDir);

console.log(`\n✅ Log cleanup completed!`);
console.log(`📊 Files cleaned: ${totalCleaned}`);

if (totalCleaned === 0) {
  console.log('ℹ️ No @TODO error logs found to clean');
} else {
  console.log('🎉 All @TODO error logs have been removed');
}
