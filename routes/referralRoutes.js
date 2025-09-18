import express from 'express';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';
import cacheManager from '../utils/cache.js';

const router = express.Router();

// Get referral tree for a user (all 21 levels)
router.get('/tree/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const maxLevels = parseInt(req.query.levels) || 21;
    
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    // Get all levels for this user
    const userLevels = await Level.find({
      referrerAddress: walletAddress,
      level: { $lte: maxLevels },
      isActive: true
    }).sort({ level: 1 });
    
    // Group by level
    const tree = {};
    for (let i = 1; i <= maxLevels; i++) {
      tree[`level${i}`] = [];
    }
    
    // Populate tree with user data
    for (const levelData of userLevels) {
      const levelUser = await User.findByWallet(levelData.userAddress);
      
      if (levelUser) {
        tree[`level${levelData.level}`].push({
          userAddress: levelData.userAddress,
          registrationTime: levelUser.registrationTime,
          totalInvestment: levelData.totalInvestment,
          totalEarnings: levelData.totalEarnings,
          depositCount: levelUser.getDepositCount(),
          status: levelUser.status
        });
      }
    }
    
    // Calculate statistics for each level
    const levelStats = {};
    for (let i = 1; i <= maxLevels; i++) {
      const levelUsers = tree[`level${i}`];
      levelStats[`level${i}`] = {
        userCount: levelUsers.length,
        totalInvestment: levelUsers.reduce((sum, user) => sum + user.totalInvestment, 0),
        totalEarnings: levelUsers.reduce((sum, user) => sum + user.totalEarnings, 0),
        activeUsers: levelUsers.filter(user => user.status === 'active').length
      };
    }
    
    res.json({
      referrerAddress: walletAddress,
      tree,
      levelStats,
      totalTeamSize: Object.values(levelStats).reduce((sum, stat) => sum + stat.userCount, 0),
      totalTeamInvestment: Object.values(levelStats).reduce((sum, stat) => sum + stat.totalInvestment, 0),
      totalTeamEarnings: Object.values(levelStats).reduce((sum, stat) => sum + stat.totalEarnings, 0),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting referral tree:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get upline chain for a user
router.get('/upline/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const maxLevels = parseInt(req.query.levels) || 21;
    
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    const uplineChain = [];
    let currentAddress = user.referrerAddress;
    let level = 1;
    
    while (currentAddress && level <= maxLevels) {
      const uplineUser = await User.findByWallet(currentAddress);
      
      if (!uplineUser) {
        break;
      }
      
      // Get level relationship data
      const levelData = await Level.findOne({
        userAddress: walletAddress,
        referrerAddress: currentAddress,
        level,
        isActive: true
      });
      
      uplineChain.push({
        level,
        userAddress: currentAddress,
        registrationTime: uplineUser.registrationTime,
        status: uplineUser.status,
        totalInvestment: levelData ? levelData.totalInvestment : 0,
        totalEarnings: levelData ? levelData.totalEarnings : 0,
        depositCount: uplineUser.getDepositCount()
      });
      
      currentAddress = uplineUser.referrerAddress;
      level++;
    }
    
    res.json({
      userAddress: walletAddress,
      uplineChain,
      totalUplineUsers: uplineChain.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting upline chain:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get referral statistics for a user
router.get('/stats/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    // Get direct referrals
    const directReferrals = await User.find({
      referrerAddress: walletAddress,
      status: 'active'
    });
    
    // Get all level statistics
    const levelStats = await Level.find({
      referrerAddress: walletAddress,
      isActive: true
    });
    
    // Group by level and calculate statistics
    const levelSummary = {};
    for (let i = 1; i <= 21; i++) {
      const levelData = levelStats.filter(stat => stat.level === i);
      levelSummary[`level${i}`] = {
        userCount: levelData.length,
        totalInvestment: levelData.reduce((sum, data) => sum + data.totalInvestment, 0),
        totalEarnings: levelData.reduce((sum, data) => sum + data.totalEarnings, 0)
      };
    }
    
    // Calculate totals
    const totalTeamSize = levelStats.length;
    const totalTeamInvestment = levelStats.reduce((sum, stat) => sum + stat.totalInvestment, 0);
    const totalTeamEarnings = levelStats.reduce((sum, stat) => sum + stat.totalEarnings, 0);
    
    res.json({
      userAddress: walletAddress,
      directReferrals: {
        count: directReferrals.length,
        users: directReferrals.map(ref => ({
          userAddress: ref.walletAddress,
          registrationTime: ref.registrationTime,
          status: ref.status,
          depositCount: ref.getDepositCount()
        }))
      },
      levelSummary,
      totals: {
        totalTeamSize,
        totalTeamInvestment,
        totalTeamEarnings,
        averageInvestmentPerUser: totalTeamSize > 0 ? totalTeamInvestment / totalTeamSize : 0,
        averageEarningsPerUser: totalTeamSize > 0 ? totalTeamEarnings / totalTeamSize : 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting referral statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get top referrers across all levels
router.get('/top-referrers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const topReferrers = await Level.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$referrerAddress',
          totalUsers: { $sum: 1 },
          totalInvestment: { $sum: '$totalInvestment' },
          totalEarnings: { $sum: '$totalEarnings' },
          levels: { $addToSet: '$level' }
        }
      },
      {
        $project: {
          referrerAddress: '$_id',
          totalUsers: 1,
          totalInvestment: 1,
          totalEarnings: 1,
          activeLevels: { $size: '$levels' },
          averageInvestmentPerUser: {
            $cond: {
              if: { $gt: ['$totalUsers', 0] },
              then: { $divide: ['$totalInvestment', '$totalUsers'] },
              else: 0
            }
          },
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
      { $limit: limit }
    ]);
    
    // Get additional user details
    const referrersWithDetails = await Promise.all(
      topReferrers.map(async (referrer) => {
        const user = await User.findByWallet(referrer.referrerAddress);
        return {
          ...referrer,
          registrationTime: user ? user.registrationTime : null,
          status: user ? user.status : 'unknown',
          personalDeposits: user ? user.getTotalDeposits() : 0
        };
      })
    );
    
    res.json({
      topReferrers: referrersWithDetails,
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

// Get referral network overview
router.get('/network/overview', async (req, res) => {
  try {
    // Get overall network statistics
    const [
      totalUsers,
      totalLevelRelationships,
      levelDistribution,
      networkStats
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      Level.countDocuments({ isActive: true }),
      Level.aggregate([
        { $match: { isActive: true } },
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
      Level.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalInvestment: { $sum: '$totalInvestment' },
            totalEarnings: { $sum: '$totalEarnings' },
            averageInvestment: { $avg: '$totalInvestment' },
            averageEarnings: { $avg: '$totalEarnings' }
          }
        }
      ])
    ]);
    
    const stats = networkStats.length > 0 ? networkStats[0] : {
      totalInvestment: 0,
      totalEarnings: 0,
      averageInvestment: 0,
      averageEarnings: 0
    };
    
    // Create level distribution array for all 21 levels
    const levelDist = [];
    for (let i = 1; i <= 21; i++) {
      const levelData = levelDistribution.find(dist => dist._id === i);
      levelDist.push({
        level: i,
        userCount: levelData ? levelData.userCount : 0,
        totalInvestment: levelData ? levelData.totalInvestment : 0,
        totalEarnings: levelData ? levelData.totalEarnings : 0,
        percentage: totalLevelRelationships > 0 ? 
          ((levelData ? levelData.userCount : 0) / totalLevelRelationships * 100).toFixed(2) : 0
      });
    }
    
    res.json({
      networkOverview: {
        totalUsers,
        totalLevelRelationships,
        totalInvestment: stats.totalInvestment,
        totalEarnings: stats.totalEarnings,
        averageInvestmentPerRelationship: stats.averageInvestment,
        averageEarningsPerRelationship: stats.averageEarnings
      },
      levelDistribution: levelDist,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting network overview:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get referral tree using only User model (more reliable)
router.get('/tree-direct/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const levels = parseInt(req.query.levels) || 21;

    if (levels > 21) {
      return res.status(400).json({
        error: 'Maximum 21 levels allowed'
      });
    }

    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const tree = {};
    const levelStats = {};
    let totalTeamSize = 0;
    let totalTeamInvestment = 0;

    // Function to get users at a specific level
    const getUsersAtLevel = async (currentReferrer, targetLevel, currentLevel = 1) => {
      if (currentLevel > 21) return [];

      // Get direct referrals of current referrer
      const directReferrals = await User.find({
        referrerAddress: currentReferrer.toLowerCase(),
        status: 'active'
      });

      let usersAtThisLevel = [];

      if (currentLevel === targetLevel) {
        // We found users at the target level
        for (const userRef of directReferrals) {
          // Get investment data for this user
          const investments = await Investment.find({
            userAddress: userRef.walletAddress
          });

          const userInvestment = investments.reduce((sum, inv) => sum + inv.amount, 0);

          usersAtThisLevel.push({
            userAddress: userRef.walletAddress,
            level: targetLevel,
            totalInvestment: userInvestment,
            totalEarnings: 0, // Will be calculated based on commission rules
            registrationTime: userRef.registrationTime,
            isActive: userRef.status === 'active',
            depositCount: userRef.deposits.length
          });
        }
      } else {
        // Go deeper to find users at target level
        for (const userRef of directReferrals) {
          const deeperUsers = await getUsersAtLevel(userRef.walletAddress, targetLevel, currentLevel + 1);
          usersAtThisLevel = usersAtThisLevel.concat(deeperUsers);
        }
      }

      return usersAtThisLevel;
    };

    // Get level data for each level
    for (let level = 1; level <= levels; level++) {
      const levelData = await getUsersAtLevel(walletAddress, level);

      tree[`level${level}`] = levelData;

      const levelInvestment = levelData.reduce((sum, item) => sum + item.totalInvestment, 0);
      const levelEarnings = levelData.reduce((sum, item) => sum + item.totalEarnings, 0);

      levelStats[`level${level}`] = {
        userCount: levelData.length,
        totalInvestment: levelInvestment,
        totalEarnings: levelEarnings
      };

      totalTeamSize += levelData.length;
      totalTeamInvestment += levelInvestment;
    }

    res.json({
      referrerAddress: walletAddress.toLowerCase(),
      tree,
      levelStats,
      totalTeamSize,
      totalTeamInvestment,
      totalTeamEarnings: 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting referral tree (direct):', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get referral stats using only User model (more reliable)
router.get('/stats-direct/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    // Generate cache key
    const cacheKey = cacheManager.generateKey('referral_stats', walletAddress.toLowerCase());

    // Try to get from cache first
    const cachedResult = cacheManager.get(cacheKey);
    if (cachedResult) {
      logger.info(`🎯 Cache hit for referral stats: ${walletAddress}`);
      return res.json({
        ...cachedResult,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }

    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Get direct referrals
    const directReferrals = await User.find({
      referrerAddress: walletAddress.toLowerCase(),
      status: 'active'
    });

    // Calculate level summary using the same logic as tree-direct
    const levelSummary = {};
    let totalTeamSize = 0;
    let totalTeamInvestment = 0;

    // Function to get users at a specific level (reuse from tree-direct)
    const getUsersAtLevel = async (currentReferrer, targetLevel, currentLevel = 1) => {
      if (currentLevel > 21) return [];

      const directRefs = await User.find({
        referrerAddress: currentReferrer.toLowerCase(),
        status: 'active'
      });

      let usersAtThisLevel = [];

      if (currentLevel === targetLevel) {
        for (const userRef of directRefs) {
          const investments = await Investment.find({
            userAddress: userRef.walletAddress
          });

          const userInvestment = investments.reduce((sum, inv) => sum + inv.amount, 0);

          usersAtThisLevel.push({
            userAddress: userRef.walletAddress,
            totalInvestment: userInvestment,
            depositCount: userRef.deposits.length
          });
        }
      } else {
        for (const userRef of directRefs) {
          const deeperUsers = await getUsersAtLevel(userRef.walletAddress, targetLevel, currentLevel + 1);
          usersAtThisLevel = usersAtThisLevel.concat(deeperUsers);
        }
      }

      return usersAtThisLevel;
    };

    // Get stats for each level
    for (let level = 1; level <= 21; level++) {
      const levelUsers = await getUsersAtLevel(walletAddress, level);
      const levelInvestment = levelUsers.reduce((sum, user) => sum + user.totalInvestment, 0);

      levelSummary[`level${level}`] = {
        userCount: levelUsers.length,
        totalInvestment: levelInvestment,
        totalEarnings: 0
      };

      totalTeamSize += levelUsers.length;
      totalTeamInvestment += levelInvestment;
    }

    const result = {
      userAddress: walletAddress.toLowerCase(),
      directReferrals: {
        count: directReferrals.length,
        users: directReferrals.map(user => ({
          userAddress: user.walletAddress,
          registrationTime: user.registrationTime,
          status: user.status
        }))
      },
      levelSummary,
      totals: {
        totalTeamSize,
        totalTeamInvestment,
        totalTeamEarnings: 0,
        averageInvestmentPerUser: totalTeamSize > 0 ? totalTeamInvestment / totalTeamSize : 0,
        averageEarningsPerUser: 0
      },
      timestamp: new Date().toISOString()
    };

    // Cache the result for 5 minutes
    cacheManager.set(cacheKey, result, 300);
    logger.info(`💾 Cached referral stats for: ${walletAddress}`);

    res.json(result);

  } catch (error) {
    logger.error('Error getting referral stats (direct):', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Test endpoint to get sample wallet addresses
router.get('/test-wallets', async (req, res) => {
  try {
    const sampleUsers = await User.find({}).limit(5).select('walletAddress referrerAddress totalInvestment');
    res.json({
      success: true,
      users: sampleUsers,
      count: sampleUsers.length
    });
  } catch (error) {
    logger.error(`❌ Error fetching test wallets: ${error.message}`, {
      service: 'bdc-mlm-backend'
    });
    res.status(500).json({ error: 'Failed to fetch test wallets' });
  }
});

// Get users at specific level
router.get('/level/:walletAddress/:levelNumber', async (req, res) => {
  const startTime = Date.now();
  const { walletAddress, levelNumber } = req.params;
  const level = parseInt(levelNumber);

  try {
    // Check cache first
    const cacheKey = cacheManager.generateKey('level_users', walletAddress.toLowerCase(), level);
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      logger.info(`🚀 Cache hit for level users: ${walletAddress} level ${level}`, {
        service: 'bdc-mlm-backend',
        duration: Date.now() - startTime
      });
      return res.json(cached);
    }

    // Debug: Check if user exists
    const rootUser = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    if (!rootUser) {
      logger.warn(`❌ Root user not found: ${walletAddress}`, {
        service: 'bdc-mlm-backend'
      });
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`🔍 Found root user: ${rootUser.walletAddress}`, {
      service: 'bdc-mlm-backend'
    });

    // Get users at specific level using aggregation
    const pipeline = [
      { $match: { walletAddress: walletAddress.toLowerCase() } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$walletAddress',
          connectFromField: 'walletAddress',
          connectToField: 'referrerAddress',
          as: 'descendants',
          maxDepth: level - 1,
          depthField: 'level'
        }
      },
      { $unwind: '$descendants' },
      { $match: { 'descendants.level': level - 1 } },
      {
        $replaceRoot: { newRoot: '$descendants' }
      },
      {
        $project: {
          walletAddress: 1,
          referrerAddress: 1,
          totalInvestment: 1,
          registrationTime: 1,
          status: 1,
          level: 1
        }
      },
      { $sort: { registrationTime: -1 } },
      { $limit: 100 } // Limit to prevent large responses
    ];

    logger.info(`🔍 Running aggregation pipeline for level ${level}`, {
      service: 'bdc-mlm-backend',
      pipeline: JSON.stringify(pipeline, null, 2)
    });

    let users = await User.aggregate(pipeline);

    logger.info(`📊 Aggregation result: ${users.length} users found`, {
      service: 'bdc-mlm-backend',
      level,
      userCount: users.length
    });

    // If aggregation returns no results, try the recursive approach as fallback
    if (users.length === 0) {
      logger.info(`🔄 Aggregation returned no results, trying recursive approach...`, {
        service: 'bdc-mlm-backend'
      });

      // Recursive function to get users at specific level (fallback)
      const getUsersAtLevel = async (currentReferrer, targetLevel, currentLevel = 1) => {
        if (currentLevel > 21) return [];

        const directRefs = await User.find({
          referrerAddress: currentReferrer.toLowerCase(),
          status: 'active'
        });

        let usersAtThisLevel = [];

        if (currentLevel === targetLevel) {
          for (const userRef of directRefs) {
            const investments = await Investment.find({
              userAddress: userRef.walletAddress
            });

            usersAtThisLevel.push({
              ...userRef.toObject(),
              totalInvestment: investments.reduce((sum, inv) => sum + inv.amount, 0),
              investments: investments,
              level: currentLevel
            });
          }
        } else {
          for (const userRef of directRefs) {
            const deeperUsers = await getUsersAtLevel(userRef.walletAddress, targetLevel, currentLevel + 1);
            usersAtThisLevel = usersAtThisLevel.concat(deeperUsers);
          }
        }

        return usersAtThisLevel;
      };

      users = await getUsersAtLevel(walletAddress, level);

      logger.info(`📊 Recursive result: ${users.length} users found`, {
        service: 'bdc-mlm-backend',
        level,
        userCount: users.length
      });
    }

    const result = {
      level,
      users,
      count: users.length,
      totalInvestment: users.reduce((sum, user) => sum + (user.totalInvestment || 0), 0)
    };

    // Cache for 5 minutes
    cacheManager.set(cacheKey, result);

    logger.info(`✅ Level users fetched: ${walletAddress} level ${level}`, {
      service: 'bdc-mlm-backend',
      count: users.length,
      duration: Date.now() - startTime
    });

    res.json(result);
  } catch (error) {
    logger.error(`❌ Error fetching level users: ${error.message}`, {
      service: 'bdc-mlm-backend',
      walletAddress,
      level,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to fetch level users' });
  }
});

// Ultra-optimized referral tree endpoint using aggregation pipelines
router.get('/tree-ultra-optimized/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const levels = Math.min(parseInt(req.query.levels) || 21, 21);
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    // Generate cache key
    const cacheKey = cacheManager.generateKey('referral_tree_ultra', walletAddress.toLowerCase(), levels, limit);

    // Try to get from cache first
    const cachedResult = cacheManager.getLongTerm(cacheKey);
    if (cachedResult) {
      logger.info(`🎯 Cache hit for referral tree: ${walletAddress}`);
      return res.json({
        ...cachedResult,
        cached: true,
        cacheTimestamp: new Date().toISOString()
      });
    }

    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Use aggregation pipeline to get all team data in one query
    const pipeline = [
      {
        $match: {
          walletAddress: walletAddress.toLowerCase()
        }
      },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$walletAddress',
          connectFromField: 'walletAddress',
          connectToField: 'referrerAddress',
          as: 'teamMembers',
          maxDepth: levels - 1,
          depthField: 'level'
        }
      },
      {
        $unwind: {
          path: '$teamMembers',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'investments',
          localField: 'teamMembers.walletAddress',
          foreignField: 'userAddress',
          as: 'teamMembers.investments'
        }
      },
      {
        $addFields: {
          'teamMembers.totalInvestment': {
            $sum: '$teamMembers.investments.amount'
          },
          'teamMembers.level': {
            $add: ['$teamMembers.level', 1]
          }
        }
      },
      {
        $group: {
          _id: '$teamMembers.level',
          users: {
            $push: {
              $cond: [
                { $ne: ['$teamMembers', null] },
                {
                  userAddress: '$teamMembers.walletAddress',
                  totalInvestment: '$teamMembers.totalInvestment',
                  depositCount: { $size: { $ifNull: ['$teamMembers.deposits', []] } },
                  registrationTime: '$teamMembers.registrationTime',
                  status: '$teamMembers.status'
                },
                null
              ]
            }
          },
          userCount: {
            $sum: {
              $cond: [{ $ne: ['$teamMembers', null] }, 1, 0]
            }
          },
          totalInvestment: {
            $sum: {
              $cond: [
                { $ne: ['$teamMembers', null] },
                '$teamMembers.totalInvestment',
                0
              ]
            }
          }
        }
      },
      {
        $match: {
          _id: { $ne: null, $lte: levels }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    const results = await User.aggregate(pipeline);

    const tree = {};
    const levelStats = {};
    let totalTeamSize = 0;
    let totalTeamInvestment = 0;

    // Process aggregation results
    for (const levelData of results) {
      const level = levelData._id;
      if (level && level <= levels) {
        // Filter out null users and apply limit
        const validUsers = levelData.users.filter(user => user !== null).slice(0, limit);

        tree[`level${level}`] = validUsers;
        levelStats[`level${level}`] = {
          userCount: levelData.userCount,
          totalInvestment: levelData.totalInvestment,
          totalEarnings: 0 // Will be calculated separately if needed
        };

        totalTeamSize += levelData.userCount;
        totalTeamInvestment += levelData.totalInvestment;
      }
    }

    const result = {
      referrerAddress: walletAddress.toLowerCase(),
      tree,
      levelStats,
      totalTeamSize,
      totalTeamInvestment,
      totalTeamEarnings: 0,
      timestamp: new Date().toISOString(),
      optimized: true,
      method: 'aggregation-pipeline'
    };

    // Cache the result for 30 minutes
    cacheManager.setLongTerm(cacheKey, result, 1800);
    logger.info(`💾 Cached referral tree for: ${walletAddress}`);

    res.json(result);

  } catch (error) {
    logger.error('Error getting ultra-optimized referral tree:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Optimized referral tree endpoint with better performance (keep existing for compatibility)
router.get('/tree-optimized/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const levels = Math.min(parseInt(req.query.levels) || 21, 21);
    const limit = Math.min(parseInt(req.query.limit) || 100, 500); // Limit total users returned

    const user = await User.findByWallet(walletAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const tree = {};
    const levelStats = {};
    let totalTeamSize = 0;
    let totalTeamInvestment = 0;
    let totalUsersReturned = 0;

    // Optimized function to get users at a specific level with aggregation
    const getUsersAtLevelOptimized = async (currentReferrer, targetLevel, currentLevel = 1) => {
      if (currentLevel > 21 || totalUsersReturned >= limit) return [];

      // Use aggregation pipeline for better performance
      const pipeline = [
        {
          $match: {
            referrerAddress: currentReferrer.toLowerCase(),
            status: 'active'
          }
        },
        {
          $lookup: {
            from: 'investments',
            localField: 'walletAddress',
            foreignField: 'userAddress',
            as: 'investments'
          }
        },
        {
          $addFields: {
            totalInvestment: {
              $sum: '$investments.amount'
            },
            depositCount: {
              $size: '$deposits'
            }
          }
        },
        {
          $project: {
            walletAddress: 1,
            totalInvestment: 1,
            depositCount: 1,
            registrationTime: 1,
            status: 1,
            referrerAddress: 1
          }
        }
      ];

      if (currentLevel === targetLevel) {
        // We found users at the target level
        const directReferrals = await User.aggregate(pipeline);
        const remainingLimit = limit - totalUsersReturned;
        const usersToReturn = directReferrals.slice(0, remainingLimit);
        totalUsersReturned += usersToReturn.length;

        return usersToReturn.map(userRef => ({
          userAddress: userRef.walletAddress,
          totalInvestment: userRef.totalInvestment || 0,
          totalEarnings: 0,
          registrationTime: userRef.registrationTime,
          isActive: userRef.status === 'active',
          depositCount: userRef.depositCount || 0
        }));
      } else {
        // Go deeper to find users at target level
        const directReferrals = await User.aggregate(pipeline);
        let usersAtThisLevel = [];

        for (const userRef of directReferrals) {
          if (totalUsersReturned >= limit) break;

          const deeperUsers = await getUsersAtLevelOptimized(userRef.walletAddress, targetLevel, currentLevel + 1);
          usersAtThisLevel = usersAtThisLevel.concat(deeperUsers);
        }

        return usersAtThisLevel;
      }
    };

    // Get level data for each level
    for (let level = 1; level <= levels && totalUsersReturned < limit; level++) {
      const levelData = await getUsersAtLevelOptimized(walletAddress, level);

      tree[`level${level}`] = levelData;

      const levelInvestment = levelData.reduce((sum, item) => sum + item.totalInvestment, 0);
      const levelEarnings = levelData.reduce((sum, item) => sum + item.totalEarnings, 0);

      levelStats[`level${level}`] = {
        userCount: levelData.length,
        totalInvestment: levelInvestment,
        totalEarnings: levelEarnings
      };

      totalTeamSize += levelData.length;
      totalTeamInvestment += levelInvestment;
    }

    res.json({
      referrerAddress: walletAddress.toLowerCase(),
      tree,
      levelStats,
      totalTeamSize,
      totalTeamInvestment,
      totalTeamEarnings: 0,
      totalUsersReturned,
      limitReached: totalUsersReturned >= limit,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting optimized referral tree:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
