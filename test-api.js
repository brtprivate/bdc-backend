// Simple API test script
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api';
const TEST_WALLET = '0x1922C8333021F85326c14EC667C06E893C0CFf07';

async function testAPI() {
  console.log('🧪 Testing BDC MLM Backend API...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${BASE_URL.replace('/api', '')}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData.status);

    // Test 2: Comprehensive user analytics
    console.log('\n2. Testing comprehensive user analytics...');
    const userAnalyticsResponse = await fetch(
      `${BASE_URL}/levels/user/${TEST_WALLET}?details=true&limit=5`
    );
    
    if (userAnalyticsResponse.ok) {
      const userData = await userAnalyticsResponse.json();
      console.log('✅ User analytics retrieved');
      console.log(`   - Team Size: ${userData.teamSummary.totalTeamSize}`);
      console.log(`   - Team Investment: ${userData.teamSummary.totalTeamInvestment}`);
      console.log(`   - Active Levels: ${userData.teamSummary.activeLevels}`);
      console.log(`   - Query Time: ${userData.metadata.queryExecutionTime}ms`);
    } else {
      const error = await userAnalyticsResponse.json();
      console.log('❌ User analytics failed:', error.error);
    }

    // Test 3: Quick summary
    console.log('\n3. Testing quick summary...');
    const summaryResponse = await fetch(`${BASE_URL}/levels/user/${TEST_WALLET}/summary`);
    
    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      console.log('✅ Quick summary retrieved');
      console.log(`   - Personal Investment: ${summaryData.quickStats.personalInvestment}`);
      console.log(`   - ROI: ${summaryData.quickStats.roi}%`);
    } else {
      const error = await summaryResponse.json();
      console.log('❌ Quick summary failed:', error.error);
    }

    // Test 4: Level statistics
    console.log('\n4. Testing level statistics...');
    const levelStatsResponse = await fetch(`${BASE_URL}/levels/stats/all`);
    
    if (levelStatsResponse.ok) {
      const levelData = await levelStatsResponse.json();
      console.log('✅ Level statistics retrieved');
      console.log(`   - Total Levels: ${levelData.levels.length}`);
      
      const activeLevels = levelData.levels.filter(l => l.totalUsers > 0);
      console.log(`   - Active Levels: ${activeLevels.length}`);
    } else {
      console.log('❌ Level statistics failed');
    }

    // Test 5: Platform analytics
    console.log('\n5. Testing platform analytics...');
    const platformResponse = await fetch(`${BASE_URL}/analytics/platform`);
    
    if (platformResponse.ok) {
      const platformData = await platformResponse.json();
      console.log('✅ Platform analytics retrieved');
      console.log(`   - Total Users: ${platformData.platformMetrics.totalUsers}`);
      console.log(`   - Total Investment: ${platformData.platformMetrics.totalInvestmentAmount}`);
      console.log(`   - Platform ROI: ${platformData.platformMetrics.platformROI}%`);
    } else {
      console.log('❌ Platform analytics failed');
    }

    // Test 6: Invalid wallet address
    console.log('\n6. Testing error handling...');
    const invalidResponse = await fetch(`${BASE_URL}/levels/user/invalid-address`);
    
    if (!invalidResponse.ok) {
      const error = await invalidResponse.json();
      console.log('✅ Error handling works:', error.error);
    } else {
      console.log('❌ Error handling failed');
    }

    console.log('\n🎉 API testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the backend server is running on port 5000');
    console.log('   Run: npm run dev (in backend directory)');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAPI();
}

export default testAPI;
