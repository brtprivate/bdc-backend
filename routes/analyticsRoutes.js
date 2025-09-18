import express from 'express';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get comprehensive platform analytics
router.get('/platform', async (req, res) => {
  try {
    const [
      totalUsers,
      totalInvestments,
      totalLevels,
      userGrowth,
      investmentStats,
      levelDistribution,
      topPerformers
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      Investment.countDocuments({ status: 'confirmed' }),
      Level.countDocuments({ isActive: true }),
      User.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: {
              year: { $year: '$registrationTime' },
              month: { $month: '$registrationTime' },
              day: { $dayOfMonth: '$registrationTime' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
        { $limit: 30 }
      ]),
      Investment.getAllInvestmentsStatistics(),
      Level.getAllLevelsStatistics(),
      Level.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$referrerAddress',
            totalUsers: { $sum: 1 },
            totalEarnings: { $sum: '$totalEarnings' },
            totalInvestment: { $sum: '$totalInvestment' },
            activeLevels: { $addToSet: '$level' }
          }
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: 10 }
      ])
    ]);

    const investmentData = investmentStats.length > 0 ? investmentStats[0] : {
      totalAmount: 0,
      totalInvestments: 0,
      uniqueUsersCount: 0,
      averageAmount: 0
    };

    const totalEarnings = levelDistribution.reduce((sum, level) => sum + level.totalEarnings, 0);
    const totalLevelInvestment = levelDistribution.reduce((sum, level) => sum + level.totalInvestment, 0);

    // Calculate growth metrics
    const today = userGrowth.find(g => {
      const date = new Date();
      return g._id.year === date.getFullYear() && 
             g._id.month === date.getMonth() + 1 && 
             g._id.day === date.getDate();
    });
    
    const yesterday = userGrowth.find(g => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      return g._id.year === date.getFullYear() && 
             g._id.month === date.getMonth() + 1 && 
             g._id.day === date.getDate();
    });

    const todayCount = today ? today.count : 0;
    const yesterdayCount = yesterday ? yesterday.count : 0;
    const growthRate = yesterdayCount > 0 ? 
      ((todayCount - yesterdayCount) / yesterdayCount * 100).toFixed(2) : 0;

    res.json({
      platformMetrics: {
        totalUsers,
        totalInvestments,
        totalLevelRelationships: totalLevels,
        totalInvestmentAmount: parseFloat(investmentData.totalAmount.toFixed(6)),
        totalEarnings: parseFloat(totalEarnings.toFixed(6)),
        uniqueInvestors: investmentData.uniqueUsersCount,
        averageInvestmentPerUser: parseFloat(investmentData.averageAmount.toFixed(6)),
        platformROI: investmentData.totalAmount > 0 ? 
          parseFloat((totalEarnings / investmentData.totalAmount * 100).toFixed(2)) : 0
      },
      growthMetrics: {
        todayRegistrations: todayCount,
        yesterdayRegistrations: yesterdayCount,
        growthRate: parseFloat(growthRate),
        last30DaysGrowth: userGrowth.reverse()
      },
      levelDistribution: levelDistribution.map(level => ({
        level: level._id,
        userCount: level.totalUsers,
        totalInvestment: parseFloat(level.totalInvestment.toFixed(6)),
        totalEarnings: parseFloat(level.totalEarnings.toFixed(6)),
        averageInvestment: parseFloat(level.averageInvestment.toFixed(6)),
        percentage: totalUsers > 0 ? 
          parseFloat((level.totalUsers / totalUsers * 100).toFixed(2)) : 0
      })),
      topPerformers: topPerformers.map(performer => ({
        referrerAddress: performer._id,
        totalUsers: performer.totalUsers,
        totalEarnings: parseFloat(performer.totalEarnings.toFixed(6)),
        totalInvestment: parseFloat(performer.totalInvestment.toFixed(6)),
        activeLevels: performer.activeLevels.length,
        roi: performer.totalInvestment > 0 ? 
          parseFloat((performer.totalEarnings / performer.totalInvestment * 100).toFixed(2)) : 0
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting platform analytics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get level performance analytics
router.get('/levels/performance', async (req, res) => {
  try {
    const levelPerformance = await Level.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$level',
          totalUsers: { $sum: 1 },
          totalInvestment: { $sum: '$totalInvestment' },
          totalEarnings: { $sum: '$totalEarnings' },
          avgInvestment: { $avg: '$totalInvestment' },
          avgEarnings: { $avg: '$totalEarnings' },
          maxInvestment: { $max: '$totalInvestment' },
          maxEarnings: { $max: '$totalEarnings' },
          minInvestment: { $min: '$totalInvestment' },
          minEarnings: { $min: '$totalEarnings' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate performance metrics for each level
    const performanceAnalysis = levelPerformance.map(level => {
      const roi = level.totalInvestment > 0 ? 
        (level.totalEarnings / level.totalInvestment * 100) : 0;
      
      return {
        level: level._id,
        metrics: {
          totalUsers: level.totalUsers,
          totalInvestment: parseFloat(level.totalInvestment.toFixed(6)),
          totalEarnings: parseFloat(level.totalEarnings.toFixed(6)),
          averageInvestment: parseFloat(level.avgInvestment.toFixed(6)),
          averageEarnings: parseFloat(level.avgEarnings.toFixed(6)),
          roi: parseFloat(roi.toFixed(2)),
          investmentRange: {
            min: parseFloat(level.minInvestment.toFixed(6)),
            max: parseFloat(level.maxInvestment.toFixed(6))
          },
          earningsRange: {
            min: parseFloat(level.minEarnings.toFixed(6)),
            max: parseFloat(level.maxEarnings.toFixed(6))
          }
        },
        performance: {
          efficiency: level.totalUsers > 0 ? 
            parseFloat((level.totalEarnings / level.totalUsers).toFixed(6)) : 0,
          penetration: level.totalUsers, // Could be calculated as percentage of total users
          profitability: roi
        }
      };
    });

    // Fill in missing levels with zero data
    const completeAnalysis = [];
    for (let i = 1; i <= 21; i++) {
      const levelData = performanceAnalysis.find(p => p.level === i);
      if (levelData) {
        completeAnalysis.push(levelData);
      } else {
        completeAnalysis.push({
          level: i,
          metrics: {
            totalUsers: 0,
            totalInvestment: 0,
            totalEarnings: 0,
            averageInvestment: 0,
            averageEarnings: 0,
            roi: 0,
            investmentRange: { min: 0, max: 0 },
            earningsRange: { min: 0, max: 0 }
          },
          performance: {
            efficiency: 0,
            penetration: 0,
            profitability: 0
          }
        });
      }
    }

    // Calculate overall insights
    const totalUsers = performanceAnalysis.reduce((sum, p) => sum + p.metrics.totalUsers, 0);
    const totalInvestment = performanceAnalysis.reduce((sum, p) => sum + p.metrics.totalInvestment, 0);
    const totalEarnings = performanceAnalysis.reduce((sum, p) => sum + p.metrics.totalEarnings, 0);

    const insights = {
      mostActiveLevel: performanceAnalysis.reduce((max, p) => 
        p.metrics.totalUsers > max.metrics.totalUsers ? p : max, 
        performanceAnalysis[0] || { level: 1, metrics: { totalUsers: 0 } }
      ).level,
      mostProfitableLevel: performanceAnalysis.reduce((max, p) => 
        p.performance.profitability > max.performance.profitability ? p : max, 
        performanceAnalysis[0] || { level: 1, performance: { profitability: 0 } }
      ).level,
      deepestLevel: Math.max(...performanceAnalysis.filter(p => p.metrics.totalUsers > 0).map(p => p.level), 0),
      levelUtilization: performanceAnalysis.filter(p => p.metrics.totalUsers > 0).length / 21 * 100
    };

    res.json({
      levelPerformance: completeAnalysis,
      summary: {
        totalUsers,
        totalInvestment: parseFloat(totalInvestment.toFixed(6)),
        totalEarnings: parseFloat(totalEarnings.toFixed(6)),
        overallROI: totalInvestment > 0 ? 
          parseFloat((totalEarnings / totalInvestment * 100).toFixed(2)) : 0,
        activeLevels: performanceAnalysis.filter(p => p.metrics.totalUsers > 0).length
      },
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting level performance analytics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get user engagement analytics
router.get('/engagement', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [
      activeUsers,
      newRegistrations,
      investmentActivity,
      levelActivity
    ] = await Promise.all([
      User.countDocuments({ 
        status: 'active',
        updatedAt: { $gte: startDate }
      }),
      User.countDocuments({
        registrationTime: { $gte: startDate },
        status: 'active'
      }),
      Investment.aggregate([
        {
          $match: {
            investmentTime: { $gte: startDate },
            status: 'confirmed'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$investmentTime' },
              month: { $month: '$investmentTime' },
              day: { $dayOfMonth: '$investmentTime' }
            },
            totalAmount: { $sum: '$amount' },
            totalInvestments: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userAddress' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),
      Level.aggregate([
        {
          $match: {
            registrationTime: { $gte: startDate },
            isActive: true
          }
        },
        {
          $group: {
            _id: '$level',
            newRelationships: { $sum: 1 },
            totalInvestment: { $sum: '$totalInvestment' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Calculate engagement metrics
    const totalUsers = await User.countDocuments({ status: 'active' });
    const engagementRate = totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(2) : 0;

    // Process daily activity
    const dailyActivity = investmentActivity.map(day => ({
      date: `${day._id.year}-${String(day._id.month).padStart(2, '0')}-${String(day._id.day).padStart(2, '0')}`,
      totalAmount: parseFloat(day.totalAmount.toFixed(6)),
      totalInvestments: day.totalInvestments,
      uniqueUsers: day.uniqueUsers.length,
      averageInvestment: day.totalInvestments > 0 ? 
        parseFloat((day.totalAmount / day.totalInvestments).toFixed(6)) : 0
    }));

    res.json({
      engagementMetrics: {
        activeUsers,
        totalUsers,
        engagementRate: parseFloat(engagementRate),
        newRegistrations,
        retentionRate: totalUsers > 0 ? 
          parseFloat(((totalUsers - newRegistrations) / totalUsers * 100).toFixed(2)) : 0
      },
      dailyActivity,
      levelActivity: levelActivity.map(level => ({
        level: level._id,
        newRelationships: level.newRelationships,
        totalInvestment: parseFloat(level.totalInvestment.toFixed(6))
      })),
      timeframe: `${days} days`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting engagement analytics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
