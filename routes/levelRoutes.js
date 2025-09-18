import express from 'express';
import Level from '../models/Level.js';
import User from '../models/User.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get statistics for a specific level (1-21)
router.get('/stats/:level', async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    
    if (level < 1 || level > 21) {
      return res.status(400).json({
        error: 'Invalid level. Level must be between 1 and 21.'
      });
    }
    
    const stats = await Level.getLevelStatistics(level);
    const result = stats.length > 0 ? stats[0] : {
      totalUsers: 0,
      totalInvestment: 0,
      totalEarnings: 0,
      averageInvestment: 0,
      averageEarnings: 0
    };
    
    res.json({
      level,
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting level statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get statistics for all levels (1-21)
router.get('/stats/all', async (req, res) => {
  try {
    const allStats = await Level.getAllLevelsStatistics();
    
    // Create array for all 21 levels with default values
    const levelStats = [];
    for (let i = 1; i <= 21; i++) {
      const stat = allStats.find(s => s._id === i);
      levelStats.push({
        level: i,
        totalUsers: stat ? stat.totalUsers : 0,
        totalInvestment: stat ? stat.totalInvestment : 0,
        totalEarnings: stat ? stat.totalEarnings : 0,
        averageInvestment: stat ? stat.averageInvestment : 0,
        averageEarnings: stat ? stat.averageEarnings : 0
      });
    }
    
    res.json({
      levels: levelStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting all level statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get users in a specific level for a referrer
router.get('/:level/users/:referrerAddress', async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    const referrerAddress = req.params.referrerAddress.toLowerCase();
    
    if (level < 1 || level > 21) {
      return res.status(400).json({
        error: 'Invalid level. Level must be between 1 and 21.'
      });
    }
    
    const levelUsers = await Level.find({
      referrerAddress,
      level,
      isActive: true
    }).populate('userAddress', 'walletAddress registrationTime status');
    
    const usersWithDetails = await Promise.all(
      levelUsers.map(async (levelUser) => {
        const user = await User.findByWallet(levelUser.userAddress);
        const userInvestments = await Investment.getUserTotalInvestment(levelUser.userAddress);
        const totalInvestment = userInvestments.length > 0 ? userInvestments[0].totalAmount : 0;
        
        return {
          userAddress: levelUser.userAddress,
          level: levelUser.level,
          totalInvestment: levelUser.totalInvestment,
          totalEarnings: levelUser.totalEarnings,
          registrationTime: levelUser.registrationTime,
          isActive: levelUser.isActive,
          userTotalInvestment: totalInvestment,
          depositCount: user ? user.getDepositCount() : 0
        };
      })
    );
    
    res.json({
      level,
      referrerAddress,
      users: usersWithDetails,
      totalUsers: usersWithDetails.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting level users:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get comprehensive 21-level analytics for a user's referral network
router.get('/user/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const includeUserDetails = req.query.details === 'true';

    // Validate wallet address format
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/i;
    if (!ethAddressRegex.test(walletAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }

    // Check if user exists
    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        walletAddress
      });
    }

    // Get all level relationships for this user as referrer
    const userLevels = await Level.find({
      referrerAddress: walletAddress,
      isActive: true
    }).sort({ level: 1, registrationTime: -1 });

    // Initialize level structure for all 21 levels
    const levelAnalytics = [];
    const levelGroups = {};

    for (let i = 1; i <= 21; i++) {
      levelGroups[i] = [];
    }

    // Group users by level
    userLevels.forEach(level => {
      levelGroups[level.level].push(level);
    });

    // Calculate comprehensive statistics for each level
    let totalTeamSize = 0;
    let totalTeamInvestment = 0;
    let totalTeamEarnings = 0;
    let activeLevels = 0;

    for (let i = 1; i <= 21; i++) {
      const levelUsers = levelGroups[i];
      const totalUsers = levelUsers.length;
      const totalInvestment = levelUsers.reduce((sum, user) => sum + user.totalInvestment, 0);
      const totalEarnings = levelUsers.reduce((sum, user) => sum + user.totalEarnings, 0);
      const averageInvestment = totalUsers > 0 ? totalInvestment / totalUsers : 0;
      const averageEarnings = totalUsers > 0 ? totalEarnings / totalUsers : 0;

      // Get user details if requested
      let userDetails = [];
      if (includeUserDetails && totalUsers > 0) {
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedUsers = levelUsers.slice(startIndex, endIndex);

        userDetails = await Promise.all(
          paginatedUsers.map(async (levelUser) => {
            const userData = await User.findByWallet(levelUser.userAddress);
            const userInvestments = await Investment.getUserTotalInvestment(levelUser.userAddress);
            const investmentData = userInvestments.length > 0 ? userInvestments[0] : {
              totalAmount: 0,
              totalInvestments: 0,
              lastInvestment: null
            };

            return {
              userAddress: levelUser.userAddress,
              registrationTime: levelUser.registrationTime,
              levelInvestment: levelUser.totalInvestment,
              levelEarnings: levelUser.totalEarnings,
              personalTotalInvestment: investmentData.totalAmount,
              personalInvestmentCount: investmentData.totalInvestments,
              lastInvestmentDate: investmentData.lastInvestment,
              depositCount: userData ? userData.getDepositCount() : 0,
              status: userData ? userData.status : 'unknown',
              isActive: levelUser.isActive
            };
          })
        );
      }

      // Update totals
      totalTeamSize += totalUsers;
      totalTeamInvestment += totalInvestment;
      totalTeamEarnings += totalEarnings;
      if (totalUsers > 0) activeLevels++;

      levelAnalytics.push({
        level: i,
        statistics: {
          totalUsers,
          totalInvestment: parseFloat(totalInvestment.toFixed(6)),
          totalEarnings: parseFloat(totalEarnings.toFixed(6)),
          averageInvestment: parseFloat(averageInvestment.toFixed(6)),
          averageEarnings: parseFloat(averageEarnings.toFixed(6)),
          investmentPercentage: totalTeamInvestment > 0 ?
            parseFloat((totalInvestment / totalTeamInvestment * 100).toFixed(2)) : 0,
          earningsPercentage: totalTeamEarnings > 0 ?
            parseFloat((totalEarnings / totalTeamEarnings * 100).toFixed(2)) : 0
        },
        users: userDetails,
        pagination: includeUserDetails ? {
          currentPage: page,
          totalUsers,
          usersPerPage: limit,
          totalPages: Math.ceil(totalUsers / limit),
          hasNextPage: page < Math.ceil(totalUsers / limit),
          hasPrevPage: page > 1
        } : null
      });
    }

    // Calculate performance metrics
    const performanceMetrics = {
      roi: totalTeamInvestment > 0 ?
        parseFloat((totalTeamEarnings / totalTeamInvestment * 100).toFixed(2)) : 0,
      averageInvestmentPerUser: totalTeamSize > 0 ?
        parseFloat((totalTeamInvestment / totalTeamSize).toFixed(6)) : 0,
      averageEarningsPerUser: totalTeamSize > 0 ?
        parseFloat((totalTeamEarnings / totalTeamSize).toFixed(6)) : 0,
      levelDistributionEfficiency: activeLevels / 21 * 100,
      topPerformingLevel: levelAnalytics.reduce((max, level) =>
        level.statistics.totalEarnings > max.statistics.totalEarnings ? level : max,
        levelAnalytics[0]
      ).level
    };

    // Get user's personal statistics
    const userInvestments = await Investment.getUserTotalInvestment(walletAddress);
    const personalStats = userInvestments.length > 0 ? userInvestments[0] : {
      totalAmount: 0,
      totalInvestments: 0,
      averageAmount: 0,
      lastInvestment: null
    };

    const response = {
      userAddress: walletAddress,
      userInfo: {
        registrationTime: user.registrationTime,
        status: user.status,
        personalInvestment: parseFloat(personalStats.totalAmount.toFixed(6)),
        personalDeposits: user.getTotalDeposits(),
        depositCount: user.getDepositCount(),
        investmentCount: personalStats.totalInvestments,
        lastInvestmentDate: personalStats.lastInvestment
      },
      teamSummary: {
        totalTeamSize,
        totalTeamInvestment: parseFloat(totalTeamInvestment.toFixed(6)),
        totalTeamEarnings: parseFloat(totalTeamEarnings.toFixed(6)),
        activeLevels,
        maxLevel: Math.max(...levelAnalytics.filter(l => l.statistics.totalUsers > 0).map(l => l.level), 0),
        performanceMetrics
      },
      levelAnalytics,
      metadata: {
        includeUserDetails,
        pagination: includeUserDetails ? {
          currentPage: page,
          usersPerPage: limit
        } : null,
        dataFreshness: new Date().toISOString(),
        totalLevels: 21,
        queryExecutionTime: Date.now()
      }
    };

    // Add execution time
    response.metadata.queryExecutionTime = Date.now() - response.metadata.queryExecutionTime;

    res.json(response);

  } catch (error) {
    logger.error('Error getting comprehensive user level analytics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get top referrers for a specific level
router.get('/:level/top-referrers', async (req, res) => {
  try {
    const level = parseInt(req.params.level);
    const limit = parseInt(req.query.limit) || 10;
    
    if (level < 1 || level > 21) {
      return res.status(400).json({
        error: 'Invalid level. Level must be between 1 and 21.'
      });
    }
    
    const topReferrers = await Level.aggregate([
      { $match: { level, isActive: true } },
      {
        $group: {
          _id: '$referrerAddress',
          totalUsers: { $sum: 1 },
          totalInvestment: { $sum: '$totalInvestment' },
          totalEarnings: { $sum: '$totalEarnings' },
          averageInvestment: { $avg: '$totalInvestment' },
          averageEarnings: { $avg: '$totalEarnings' }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: limit }
    ]);
    
    res.json({
      level,
      topReferrers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting top referrers:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get level summary (overview of all levels)
router.get('/summary', async (req, res) => {
  try {
    const allStats = await Level.getAllLevelsStatistics();
    
    // Calculate totals across all levels
    const totalUsers = allStats.reduce((sum, stat) => sum + stat.totalUsers, 0);
    const totalInvestment = allStats.reduce((sum, stat) => sum + stat.totalInvestment, 0);
    const totalEarnings = allStats.reduce((sum, stat) => sum + stat.totalEarnings, 0);
    
    // Get distribution by level
    const levelDistribution = allStats.map(stat => ({
      level: stat._id,
      users: stat.totalUsers,
      investment: stat.totalInvestment,
      earnings: stat.totalEarnings,
      percentage: totalUsers > 0 ? (stat.totalUsers / totalUsers * 100).toFixed(2) : 0
    }));
    
    res.json({
      summary: {
        totalUsers,
        totalInvestment,
        totalEarnings,
        averageInvestmentPerUser: totalUsers > 0 ? totalInvestment / totalUsers : 0,
        averageEarningsPerUser: totalUsers > 0 ? totalEarnings / totalUsers : 0
      },
      levelDistribution,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting level summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get quick summary for a user (optimized for dashboard widgets)
router.get('/user/:walletAddress/summary', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();

    // Validate wallet address
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/i;
    if (!ethAddressRegex.test(walletAddress)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }

    // Check if user exists
    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        walletAddress
      });
    }

    // Get aggregated statistics using MongoDB aggregation for performance
    const [levelStats, personalStats] = await Promise.all([
      Level.aggregate([
        { $match: { referrerAddress: walletAddress, isActive: true } },
        {
          $group: {
            _id: '$level',
            userCount: { $sum: 1 },
            totalInvestment: { $sum: '$totalInvestment' },
            totalEarnings: { $sum: '$totalEarnings' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Investment.getUserTotalInvestment(walletAddress)
    ]);

    // Calculate quick totals
    const totalTeamSize = levelStats.reduce((sum, stat) => sum + stat.userCount, 0);
    const totalTeamInvestment = levelStats.reduce((sum, stat) => sum + stat.totalInvestment, 0);
    const totalTeamEarnings = levelStats.reduce((sum, stat) => sum + stat.totalEarnings, 0);
    const activeLevels = levelStats.length;

    // Create level summary (only levels with users)
    const levelSummary = levelStats.map(stat => ({
      level: stat._id,
      userCount: stat.userCount,
      totalInvestment: parseFloat(stat.totalInvestment.toFixed(6)),
      totalEarnings: parseFloat(stat.totalEarnings.toFixed(6)),
      averageInvestment: stat.userCount > 0 ?
        parseFloat((stat.totalInvestment / stat.userCount).toFixed(6)) : 0
    }));

    const personalData = personalStats.length > 0 ? personalStats[0] : {
      totalAmount: 0,
      totalInvestments: 0
    };

    res.json({
      userAddress: walletAddress,
      quickStats: {
        personalInvestment: parseFloat(personalData.totalAmount.toFixed(6)),
        personalDeposits: user.getTotalDeposits(),
        totalTeamSize,
        totalTeamInvestment: parseFloat(totalTeamInvestment.toFixed(6)),
        totalTeamEarnings: parseFloat(totalTeamEarnings.toFixed(6)),
        activeLevels,
        maxLevel: activeLevels > 0 ? Math.max(...levelStats.map(s => s._id)) : 0,
        roi: totalTeamInvestment > 0 ?
          parseFloat((totalTeamEarnings / totalTeamInvestment * 100).toFixed(2)) : 0
      },
      levelSummary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting user level summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get level comparison for multiple users
router.post('/compare', async (req, res) => {
  try {
    const { walletAddresses } = req.body;

    if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      return res.status(400).json({
        error: 'walletAddresses array is required'
      });
    }

    if (walletAddresses.length > 10) {
      return res.status(400).json({
        error: 'Maximum 10 wallet addresses allowed for comparison'
      });
    }

    const comparisons = await Promise.all(
      walletAddresses.map(async (address) => {
        const walletAddress = address.toLowerCase();

        try {
          const user = await User.findByWallet(walletAddress);
          if (!user) {
            return {
              walletAddress,
              error: 'User not found'
            };
          }

          const levelStats = await Level.aggregate([
            { $match: { referrerAddress: walletAddress, isActive: true } },
            {
              $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                totalInvestment: { $sum: '$totalInvestment' },
                totalEarnings: { $sum: '$totalEarnings' },
                activeLevels: { $addToSet: '$level' }
              }
            }
          ]);

          const stats = levelStats.length > 0 ? levelStats[0] : {
            totalUsers: 0,
            totalInvestment: 0,
            totalEarnings: 0,
            activeLevels: []
          };

          const personalStats = await Investment.getUserTotalInvestment(walletAddress);
          const personalData = personalStats.length > 0 ? personalStats[0] : {
            totalAmount: 0
          };

          return {
            walletAddress,
            stats: {
              personalInvestment: parseFloat(personalData.totalAmount.toFixed(6)),
              teamSize: stats.totalUsers,
              teamInvestment: parseFloat(stats.totalInvestment.toFixed(6)),
              teamEarnings: parseFloat(stats.totalEarnings.toFixed(6)),
              activeLevels: stats.activeLevels.length,
              roi: stats.totalInvestment > 0 ?
                parseFloat((stats.totalEarnings / stats.totalInvestment * 100).toFixed(2)) : 0
            },
            registrationTime: user.registrationTime,
            status: user.status
          };

        } catch (error) {
          return {
            walletAddress,
            error: error.message
          };
        }
      })
    );

    // Calculate rankings
    const validComparisons = comparisons.filter(comp => !comp.error);
    const rankings = {
      byTeamSize: [...validComparisons].sort((a, b) => b.stats.teamSize - a.stats.teamSize),
      byTeamEarnings: [...validComparisons].sort((a, b) => b.stats.teamEarnings - a.stats.teamEarnings),
      byROI: [...validComparisons].sort((a, b) => b.stats.roi - a.stats.roi)
    };

    res.json({
      comparisons,
      rankings,
      summary: {
        totalUsers: validComparisons.length,
        errors: comparisons.filter(comp => comp.error).length,
        totalTeamSize: validComparisons.reduce((sum, comp) => sum + comp.stats.teamSize, 0),
        totalTeamEarnings: validComparisons.reduce((sum, comp) => sum + comp.stats.teamEarnings, 0)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error comparing users:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
