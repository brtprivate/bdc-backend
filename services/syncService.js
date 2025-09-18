import cron from 'node-cron';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';

class SyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = process.env.SYNC_INTERVAL || 30000; // 30 seconds default
  }

  async start() {
    try {
      logger.info('🔄 Starting sync service...');
      
      // Run sync every 5 minutes
      cron.schedule('*/5 * * * *', async () => {
        if (!this.isRunning) {
          await this.performSync();
        }
      });
      
      // Initial sync
      await this.performSync();
      
      logger.info('✅ Sync service started successfully');
      
    } catch (error) {
      logger.error('❌ Error starting sync service:', error);
      throw error;
    }
  }

  async performSync() {
    if (this.isRunning) {
      logger.info('⏳ Sync already running, skipping...');
      return;
    }

    this.isRunning = true;
    
    try {
      logger.info('🔄 Starting data synchronization...');
      
      // Sync user statistics
      await this.syncUserStatistics();
      
      // Sync level statistics
      await this.syncLevelStatistics();
      
      // Clean up inactive records
      await this.cleanupInactiveRecords();
      
      logger.info('✅ Data synchronization completed');
      
    } catch (error) {
      logger.error('❌ Error during sync:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async syncUserStatistics() {
    try {
      logger.info('📊 Syncing user statistics...');
      
      const users = await User.find({ status: 'active' });
      
      for (const user of users) {
        // Update total deposits from deposits array
        const totalDeposits = user.getTotalDeposits();
        
        // Update from Investment collection as well
        const investmentStats = await Investment.getUserTotalInvestment(user.walletAddress);
        const dbTotalInvestment = investmentStats.length > 0 ? investmentStats[0].totalAmount : 0;
        
        // Use the maximum of both values
        const actualTotal = Math.max(totalDeposits, dbTotalInvestment);
        
        if (actualTotal !== totalDeposits) {
          logger.info(`🔄 Updating user ${user.walletAddress} deposits: ${totalDeposits} -> ${actualTotal}`);
        }
      }
      
      logger.info('✅ User statistics sync completed');
      
    } catch (error) {
      logger.error('❌ Error syncing user statistics:', error);
    }
  }

  async syncLevelStatistics() {
    try {
      logger.info('📊 Syncing level statistics...');
      
      // Get all levels statistics
      const levelStats = await Level.getAllLevelsStatistics();
      
      for (const stat of levelStats) {
        logger.info(`📈 Level ${stat._id}: ${stat.totalUsers} users, ${stat.totalInvestment} investment, ${stat.totalEarnings} earnings`);
      }
      
      logger.info('✅ Level statistics sync completed');
      
    } catch (error) {
      logger.error('❌ Error syncing level statistics:', error);
    }
  }

  async cleanupInactiveRecords() {
    try {
      logger.info('🧹 Cleaning up inactive records...');
      
      // Mark users as inactive if they haven't made any deposits in 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const inactiveUsers = await User.updateMany(
        {
          status: 'active',
          'deposits.0': { $exists: false }, // No deposits
          registrationTime: { $lt: ninetyDaysAgo }
        },
        {
          $set: { status: 'inactive' }
        }
      );
      
      if (inactiveUsers.modifiedCount > 0) {
        logger.info(`🔄 Marked ${inactiveUsers.modifiedCount} users as inactive`);
      }
      
      // Mark level relationships as inactive for inactive users
      const inactiveLevels = await Level.updateMany(
        {
          isActive: true,
          $or: [
            { userAddress: { $in: await this.getInactiveUserAddresses() } },
            { referrerAddress: { $in: await this.getInactiveUserAddresses() } }
          ]
        },
        {
          $set: { isActive: false }
        }
      );
      
      if (inactiveLevels.modifiedCount > 0) {
        logger.info(`🔄 Marked ${inactiveLevels.modifiedCount} level relationships as inactive`);
      }
      
      logger.info('✅ Cleanup completed');
      
    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
    }
  }

  async getInactiveUserAddresses() {
    const inactiveUsers = await User.find(
      { status: 'inactive' },
      { walletAddress: 1 }
    );
    
    return inactiveUsers.map(user => user.walletAddress);
  }

  async generateDailyReport() {
    try {
      logger.info('📊 Generating daily report...');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get today's statistics
      const todayUsers = await User.countDocuments({
        registrationTime: { $gte: today, $lt: tomorrow }
      });
      
      const todayInvestments = await Investment.aggregate([
        {
          $match: {
            investmentTime: { $gte: today, $lt: tomorrow },
            status: 'confirmed'
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: 1 }
          }
        }
      ]);
      
      const investmentData = todayInvestments.length > 0 ? todayInvestments[0] : { totalAmount: 0, totalCount: 0 };
      
      // Get overall statistics
      const totalUsers = await User.countDocuments({ status: 'active' });
      const totalInvestmentData = await Investment.getAllInvestmentsStatistics();
      const overallData = totalInvestmentData.length > 0 ? totalInvestmentData[0] : { totalAmount: 0, totalInvestments: 0 };
      
      const report = {
        date: today.toISOString().split('T')[0],
        today: {
          newUsers: todayUsers,
          totalInvestment: investmentData.totalAmount,
          totalInvestments: investmentData.totalCount
        },
        overall: {
          totalUsers,
          totalInvestment: overallData.totalAmount,
          totalInvestments: overallData.totalInvestments,
          uniqueInvestors: overallData.uniqueUsersCount || 0
        }
      };
      
      logger.info('📊 Daily Report:', report);
      
      return report;
      
    } catch (error) {
      logger.error('❌ Error generating daily report:', error);
      return null;
    }
  }

  stop() {
    logger.info('🛑 Sync service stopped');
  }
}

let syncService = null;

export async function startSyncService() {
  if (!syncService) {
    syncService = new SyncService();
    await syncService.start();
  }
  return syncService;
}

export async function stopSyncService() {
  if (syncService) {
    syncService.stop();
    syncService = null;
  }
}

export default SyncService;
