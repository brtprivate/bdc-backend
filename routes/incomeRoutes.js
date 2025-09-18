import express from 'express';
import Income from '../models/Income.js';
import Level from '../models/Level.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get income statistics for a user
router.get('/user/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    // Get income from Level model (earnings from referrals)
    const levelEarnings = await Level.find({
      referrerAddress: walletAddress,
      isActive: true
    });
    
    // Group earnings by level
    const earningsByLevel = {};
    let totalEarnings = 0;
    
    for (let i = 1; i <= 21; i++) {
      const levelData = levelEarnings.filter(earning => earning.level === i);
      const levelTotal = levelData.reduce((sum, data) => sum + data.totalEarnings, 0);
      
      earningsByLevel[`level${i}`] = {
        userCount: levelData.length,
        totalEarnings: levelTotal,
        averageEarnings: levelData.length > 0 ? levelTotal / levelData.length : 0
      };
      
      totalEarnings += levelTotal;
    }
    
    res.json({
      userAddress: walletAddress,
      totalEarnings,
      earningsByLevel,
      summary: {
        activeLevels: Object.values(earningsByLevel).filter(level => level.userCount > 0).length,
        totalReferrals: levelEarnings.length,
        averageEarningsPerReferral: levelEarnings.length > 0 ? totalEarnings / levelEarnings.length : 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting user income:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get income statistics for a specific level
router.get('/level/:level', async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    
    if (level < 1 || level > 21) {
      return res.status(400).json({
        error: 'Invalid level. Level must be between 1 and 21.'
      });
    }
    
    const levelEarnings = await Level.find({
      level,
      isActive: true
    });
    
    // Calculate statistics
    const totalEarnings = levelEarnings.reduce((sum, data) => sum + data.totalEarnings, 0);
    const totalUsers = levelEarnings.length;
    const averageEarnings = totalUsers > 0 ? totalEarnings / totalUsers : 0;
    
    // Get top earners for this level
    const topEarners = levelEarnings
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10)
      .map(earning => ({
        referrerAddress: earning.referrerAddress,
        userAddress: earning.userAddress,
        totalEarnings: earning.totalEarnings,
        totalInvestment: earning.totalInvestment,
        registrationTime: earning.registrationTime
      }));
    
    res.json({
      level,
      statistics: {
        totalUsers,
        totalEarnings,
        averageEarnings,
        maxEarnings: totalUsers > 0 ? Math.max(...levelEarnings.map(e => e.totalEarnings)) : 0,
        minEarnings: totalUsers > 0 ? Math.min(...levelEarnings.map(e => e.totalEarnings)) : 0
      },
      topEarners,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting level income:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get overall income statistics across all levels
router.get('/overview', async (req, res) => {
  try {
    const allLevelStats = await Level.getAllLevelsStatistics();
    
    // Calculate totals
    const totalEarnings = allLevelStats.reduce((sum, stat) => sum + stat.totalEarnings, 0);
    const totalUsers = allLevelStats.reduce((sum, stat) => sum + stat.totalUsers, 0);
    const totalInvestment = allLevelStats.reduce((sum, stat) => sum + stat.totalInvestment, 0);
    
    // Create level breakdown
    const levelBreakdown = [];
    for (let i = 1; i <= 21; i++) {
      const levelData = allLevelStats.find(stat => stat._id === i);
      levelBreakdown.push({
        level: i,
        totalUsers: levelData ? levelData.totalUsers : 0,
        totalEarnings: levelData ? levelData.totalEarnings : 0,
        totalInvestment: levelData ? levelData.totalInvestment : 0,
        averageEarnings: levelData ? levelData.averageEarnings : 0,
        earningsPercentage: totalEarnings > 0 ? 
          ((levelData ? levelData.totalEarnings : 0) / totalEarnings * 100).toFixed(2) : 0
      });
    }
    
    // Get top earning referrers across all levels
    const topEarners = await Level.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$referrerAddress',
          totalEarnings: { $sum: '$totalEarnings' },
          totalUsers: { $sum: 1 },
          totalInvestment: { $sum: '$totalInvestment' },
          activeLevels: { $addToSet: '$level' }
        }
      },
      {
        $project: {
          referrerAddress: '$_id',
          totalEarnings: 1,
          totalUsers: 1,
          totalInvestment: 1,
          activeLevels: { $size: '$activeLevels' },
          averageEarningsPerUser: {
            $cond: {
              if: { $gt: ['$totalUsers', 0] },
              then: { $divide: ['$totalEarnings', '$totalUsers'] },
              else: 0
            }
          }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      overview: {
        totalEarnings,
        totalUsers,
        totalInvestment,
        averageEarningsPerUser: totalUsers > 0 ? totalEarnings / totalUsers : 0,
        earningsToInvestmentRatio: totalInvestment > 0 ? (totalEarnings / totalInvestment * 100).toFixed(2) : 0
      },
      levelBreakdown,
      topEarners,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting income overview:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get income trends (daily/weekly/monthly)
router.get('/trends', async (req, res) => {
  try {
    const period = req.query.period || 'daily'; // daily, weekly, monthly
    const days = parseInt(req.query.days) || 30;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let groupBy;
    switch (period) {
      case 'weekly':
        groupBy = {
          year: { $year: '$registrationTime' },
          week: { $week: '$registrationTime' }
        };
        break;
      case 'monthly':
        groupBy = {
          year: { $year: '$registrationTime' },
          month: { $month: '$registrationTime' }
        };
        break;
      default: // daily
        groupBy = {
          year: { $year: '$registrationTime' },
          month: { $month: '$registrationTime' },
          day: { $dayOfMonth: '$registrationTime' }
        };
    }
    
    const trends = await Level.aggregate([
      {
        $match: {
          registrationTime: { $gte: startDate },
          isActive: true
        }
      },
      {
        $group: {
          _id: groupBy,
          totalEarnings: { $sum: '$totalEarnings' },
          totalInvestment: { $sum: '$totalInvestment' },
          totalUsers: { $sum: 1 },
          levels: { $addToSet: '$level' }
        }
      },
      {
        $project: {
          period: '$_id',
          totalEarnings: 1,
          totalInvestment: 1,
          totalUsers: 1,
          activeLevels: { $size: '$levels' },
          averageEarningsPerUser: {
            $cond: {
              if: { $gt: ['$totalUsers', 0] },
              then: { $divide: ['$totalEarnings', '$totalUsers'] },
              else: 0
            }
          }
        }
      },
      { $sort: { 'period.year': 1, 'period.month': 1, 'period.day': 1, 'period.week': 1 } }
    ]);
    
    res.json({
      period,
      days,
      trends,
      summary: {
        totalPeriods: trends.length,
        totalEarnings: trends.reduce((sum, trend) => sum + trend.totalEarnings, 0),
        totalInvestment: trends.reduce((sum, trend) => sum + trend.totalInvestment, 0),
        totalUsers: trends.reduce((sum, trend) => sum + trend.totalUsers, 0)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting income trends:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get commission rates for all levels
router.get('/commission-rates', async (req, res) => {
  try {
    // Define commission rates for each level (you can customize these)
    const commissionRates = [
      { level: 1, rate: 10, description: 'Direct referral commission' },
      { level: 2, rate: 5, description: 'Second level commission' },
      { level: 3, rate: 3, description: 'Third level commission' },
      { level: 4, rate: 2, description: 'Fourth level commission' },
      { level: 5, rate: 1, description: 'Fifth level commission' },
      { level: 6, rate: 1, description: 'Sixth level commission' },
      { level: 7, rate: 1, description: 'Seventh level commission' },
      { level: 8, rate: 0.5, description: 'Eighth level commission' },
      { level: 9, rate: 0.5, description: 'Ninth level commission' },
      { level: 10, rate: 0.5, description: 'Tenth level commission' },
      { level: 11, rate: 0.3, description: 'Eleventh level commission' },
      { level: 12, rate: 0.3, description: 'Twelfth level commission' },
      { level: 13, rate: 0.3, description: 'Thirteenth level commission' },
      { level: 14, rate: 0.2, description: 'Fourteenth level commission' },
      { level: 15, rate: 0.2, description: 'Fifteenth level commission' },
      { level: 16, rate: 0.2, description: 'Sixteenth level commission' },
      { level: 17, rate: 0.1, description: 'Seventeenth level commission' },
      { level: 18, rate: 0.1, description: 'Eighteenth level commission' },
      { level: 19, rate: 0.1, description: 'Nineteenth level commission' },
      { level: 20, rate: 0.1, description: 'Twentieth level commission' },
      { level: 21, rate: 0.1, description: 'Twenty-first level commission' }
    ];
    
    // Calculate total commission rate
    const totalRate = commissionRates.reduce((sum, rate) => sum + rate.rate, 0);
    
    res.json({
      commissionRates,
      summary: {
        totalLevels: 21,
        totalCommissionRate: totalRate,
        averageCommissionRate: totalRate / 21,
        highestRate: Math.max(...commissionRates.map(r => r.rate)),
        lowestRate: Math.min(...commissionRates.map(r => r.rate))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting commission rates:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
