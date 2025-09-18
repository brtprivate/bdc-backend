import express from 'express';
import { ethers } from 'ethers';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';

const router = express.Router();

const CONTRACT_ADDRESS = process.env.DWC_CONTRACT_ADDRESS || '0xa204d59852fabde359aaf4b31b59eb5b0338c312';
const RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/';

// Get contract information
router.get('/info', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const currentBlock = await provider.getBlockNumber();
    
    res.json({
      contractAddress: CONTRACT_ADDRESS,
      rpcUrl: RPC_URL,
      currentBlock,
      chainId: process.env.CHAIN_ID || 56,
      networkName: 'BSC Mainnet',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting contract info:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Sync user data from contract
router.post('/sync/user/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    // This would typically call contract methods to get user data
    // For now, we'll return the database data
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found in database'
      });
    }
    
    // Get user's level data
    const userLevels = await Level.find({
      referrerAddress: walletAddress,
      isActive: true
    });
    
    // Get user's investments
    const investments = await Investment.find({
      userAddress: walletAddress,
      status: 'confirmed'
    });
    
    res.json({
      user: {
        walletAddress: user.walletAddress,
        referrerAddress: user.referrerAddress,
        registrationTime: user.registrationTime,
        status: user.status,
        deposits: user.deposits
      },
      levels: userLevels.map(level => ({
        level: level.level,
        userAddress: level.userAddress,
        totalInvestment: level.totalInvestment,
        totalEarnings: level.totalEarnings,
        registrationTime: level.registrationTime
      })),
      investments: investments.map(inv => ({
        amount: inv.amount,
        txHash: inv.txHash,
        blockNumber: inv.blockNumber,
        type: inv.type,
        investmentTime: inv.investmentTime
      })),
      syncTime: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error syncing user data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get contract events for a specific user
router.get('/events/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const eventType = req.query.type; // registration, deposit, transaction
    
    // Get events from database (stored from event listener)
    const events = [];
    
    // Get registration events
    if (!eventType || eventType === 'registration') {
      const user = await User.findByWallet(walletAddress);
      if (user) {
        events.push({
          type: 'registration',
          userAddress: user.walletAddress,
          referrerAddress: user.referrerAddress,
          timestamp: user.registrationTime,
          blockNumber: null,
          txHash: null
        });
      }
    }
    
    // Get deposit events
    if (!eventType || eventType === 'deposit') {
      const investments = await Investment.find({
        userAddress: walletAddress,
        status: 'confirmed'
      }).sort({ investmentTime: -1 });
      
      investments.forEach(inv => {
        events.push({
          type: 'deposit',
          userAddress: inv.userAddress,
          amount: inv.amount,
          tokenType: inv.type,
          timestamp: inv.investmentTime,
          blockNumber: inv.blockNumber,
          txHash: inv.txHash
        });
      });
    }
    
    // Get transaction events (earnings)
    if (!eventType || eventType === 'transaction') {
      const levelEarnings = await Level.find({
        $or: [
          { userAddress: walletAddress },
          { referrerAddress: walletAddress }
        ],
        isActive: true,
        totalEarnings: { $gt: 0 }
      }).sort({ registrationTime: -1 });
      
      levelEarnings.forEach(level => {
        events.push({
          type: 'transaction',
          userAddress: level.userAddress,
          referrerAddress: level.referrerAddress,
          level: level.level,
          earnings: level.totalEarnings,
          timestamp: level.registrationTime,
          blockNumber: null,
          txHash: null
        });
      });
    }
    
    // Sort events by timestamp
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      userAddress: walletAddress,
      eventType: eventType || 'all',
      events,
      totalEvents: events.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting contract events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get contract statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalInvestments,
      totalLevels,
      investmentStats,
      levelStats
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      Investment.countDocuments({ status: 'confirmed' }),
      Level.countDocuments({ isActive: true }),
      Investment.getAllInvestmentsStatistics(),
      Level.getAllLevelsStatistics()
    ]);
    
    const investmentData = investmentStats.length > 0 ? investmentStats[0] : {
      totalAmount: 0,
      totalInvestments: 0,
      uniqueUsersCount: 0,
      averageAmount: 0
    };
    
    const totalEarnings = levelStats.reduce((sum, stat) => sum + stat.totalEarnings, 0);
    const totalLevelInvestment = levelStats.reduce((sum, stat) => sum + stat.totalInvestment, 0);
    
    res.json({
      contractStats: {
        totalUsers,
        totalInvestments,
        totalLevelRelationships: totalLevels,
        totalInvestmentAmount: investmentData.totalAmount,
        totalEarnings,
        uniqueInvestors: investmentData.uniqueUsersCount,
        averageInvestmentPerUser: investmentData.averageAmount,
        earningsToInvestmentRatio: investmentData.totalAmount > 0 ? 
          (totalEarnings / investmentData.totalAmount * 100).toFixed(2) : 0
      },
      levelDistribution: levelStats.map(stat => ({
        level: stat._id,
        userCount: stat.totalUsers,
        totalInvestment: stat.totalInvestment,
        totalEarnings: stat.totalEarnings,
        averageInvestment: stat.averageInvestment,
        averageEarnings: stat.averageEarnings
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting contract statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Trigger manual sync for all users
router.post('/sync/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    // Get users to sync
    const users = await User.find({ status: 'active' })
      .sort({ registrationTime: -1 })
      .limit(limit);
    
    let syncedCount = 0;
    const errors = [];
    
    for (const user of users) {
      try {
        // Here you would typically call contract methods to get latest data
        // For now, we'll just update the user's last activity
        user.updatedAt = new Date();
        await user.save();
        syncedCount++;
      } catch (error) {
        errors.push({
          userAddress: user.walletAddress,
          error: error.message
        });
      }
    }
    
    res.json({
      message: 'Sync completed',
      syncedUsers: syncedCount,
      totalUsers: users.length,
      errors: errors.length,
      errorDetails: errors,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error syncing all users:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get recent contract activity
router.get('/activity/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const hours = parseInt(req.query.hours) || 24;
    
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);
    
    // Get recent registrations
    const recentUsers = await User.find({
      registrationTime: { $gte: startTime },
      status: 'active'
    }).sort({ registrationTime: -1 }).limit(limit);
    
    // Get recent investments
    const recentInvestments = await Investment.find({
      investmentTime: { $gte: startTime },
      status: 'confirmed'
    }).sort({ investmentTime: -1 }).limit(limit);
    
    // Get recent level activities
    const recentLevels = await Level.find({
      registrationTime: { $gte: startTime },
      isActive: true
    }).sort({ registrationTime: -1 }).limit(limit);
    
    // Combine and sort all activities
    const activities = [
      ...recentUsers.map(user => ({
        type: 'registration',
        userAddress: user.walletAddress,
        referrerAddress: user.referrerAddress,
        timestamp: user.registrationTime,
        data: { status: user.status }
      })),
      ...recentInvestments.map(inv => ({
        type: 'investment',
        userAddress: inv.userAddress,
        timestamp: inv.investmentTime,
        data: { 
          amount: inv.amount, 
          type: inv.type, 
          txHash: inv.txHash 
        }
      })),
      ...recentLevels.map(level => ({
        type: 'level_creation',
        userAddress: level.userAddress,
        referrerAddress: level.referrerAddress,
        timestamp: level.registrationTime,
        data: { 
          level: level.level,
          totalInvestment: level.totalInvestment,
          totalEarnings: level.totalEarnings
        }
      }))
    ];
    
    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      recentActivity: activities.slice(0, limit),
      timeframe: `${hours} hours`,
      totalActivities: activities.length,
      summary: {
        registrations: recentUsers.length,
        investments: recentInvestments.length,
        levelCreations: recentLevels.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting recent activity:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
