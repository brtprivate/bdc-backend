import express from 'express';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get user by wallet address
router.get('/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const user = await User.findByWallet(walletAddress);
    
    // if (!user) {
    //   return res.status(404).json({
    //     error: 'User not found'
    //   });
    // }
    
    // Get user's investment statistics
    const investmentStats = await Investment.getUserTotalInvestment(walletAddress);
    const totalInvestment = investmentStats.length > 0 ? investmentStats[0].totalAmount : 0;
    
    // Get user's referral count (direct referrals)
    const directReferrals = await User.countDocuments({
      referrerAddress: walletAddress,
      status: 'active'
    });
    
    // Get user's level statistics
    const userLevels = await Level.getUserLevels(walletAddress);
    const levelStats = {};
    
    for (let i = 1; i <= 21; i++) {
      const levelUsers = userLevels.filter(level => level.level === i);
      levelStats[`level${i}`] = {
        userCount: levelUsers.length,
        totalInvestment: levelUsers.reduce((sum, level) => sum + level.totalInvestment, 0),
        totalEarnings: levelUsers.reduce((sum, level) => sum + level.totalEarnings, 0)
      };
    }
    
    res.json({
      user: {
        walletAddress: user.walletAddress,
        referrerAddress: user.referrerAddress,
        registrationTime: user.registrationTime,
        status: user.status,
        totalDeposits: user.getTotalDeposits(),
        depositCount: user.getDepositCount(),
        deposits: user.deposits
      },
      statistics: {
        totalInvestment,
        directReferrals,
        levelStats
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get all users with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const users = await User.find({ status: 'active' })
      .sort({ registrationTime: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalUsers = await User.countDocuments({ status: 'active' });
    const totalPages = Math.ceil(totalUsers / limit);
    
    // Get additional statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const investmentStats = await Investment.getUserTotalInvestment(user.walletAddress);
        const totalInvestment = investmentStats.length > 0 ? investmentStats[0].totalAmount : 0;
        
        const directReferrals = await User.countDocuments({
          referrerAddress: user.walletAddress,
          status: 'active'
        });
        
        return {
          walletAddress: user.walletAddress,
          referrerAddress: user.referrerAddress,
          registrationTime: user.registrationTime,
          status: user.status,
          totalDeposits: user.getTotalDeposits(),
          depositCount: user.getDepositCount(),
          totalInvestment,
          directReferrals
        };
      })
    );
    
    res.json({
      users: usersWithStats,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get user's direct referrals
router.get('/:walletAddress/referrals', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const referrals = await User.getUsersByReferrer(walletAddress);
    
    // Get additional statistics for each referral
    const referralsWithStats = await Promise.all(
      referrals.map(async (referral) => {
        const investmentStats = await Investment.getUserTotalInvestment(referral.walletAddress);
        const totalInvestment = investmentStats.length > 0 ? investmentStats[0].totalAmount : 0;
        
        return {
          walletAddress: referral.walletAddress,
          registrationTime: referral.registrationTime,
          status: referral.status,
          totalDeposits: referral.getTotalDeposits(),
          depositCount: referral.getDepositCount(),
          totalInvestment
        };
      })
    );
    
    res.json({
      referrerAddress: walletAddress,
      referrals: referralsWithStats,
      totalReferrals: referralsWithStats.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting user referrals:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get user's investment history
router.get('/:walletAddress/investments', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const investments = await Investment.getUserInvestments(walletAddress);
    const investmentStats = await Investment.getUserTotalInvestment(walletAddress);
    
    const stats = investmentStats.length > 0 ? investmentStats[0] : {
      totalAmount: 0,
      totalInvestments: 0,
      averageAmount: 0,
      lastInvestment: null
    };
    
    res.json({
      userAddress: walletAddress,
      investments,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting user investments:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Create or update user
router.post('/', async (req, res) => {
  try {
    const { walletAddress, referrerAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        error: 'Wallet address is required'
      });
    }
    
    // Check if user already exists
    let user = await User.findByWallet(walletAddress);
    
    if (user) {
      return res.status(409).json({
        error: 'User already exists',
        user: {
          walletAddress: user.walletAddress,
          referrerAddress: user.referrerAddress,
          registrationTime: user.registrationTime,
          status: user.status
        }
      });
    }
    
    // Create new user
    user = new User({
      walletAddress: walletAddress.toLowerCase(),
      referrerAddress: referrerAddress ? referrerAddress.toLowerCase() : null,
      registrationTime: new Date(),
      status: 'active'
    });
    
    await user.save();
    
    logger.info(`✅ New user created: ${walletAddress}`);
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        walletAddress: user.walletAddress,
        referrerAddress: user.referrerAddress,
        registrationTime: user.registrationTime,
        status: user.status
      }
    });
    
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Update user status
router.patch('/:walletAddress/status', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const { status } = req.body;
    
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be active, inactive, or suspended.'
      });
    }
    
    const user = await User.findByWallet(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    user.status = status;
    await user.save();
    
    logger.info(`🔄 User status updated: ${walletAddress} -> ${status}`);
    
    res.json({
      message: 'User status updated successfully',
      user: {
        walletAddress: user.walletAddress,
        status: user.status
      }
    });
    
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get user statistics summary
router.get('/:walletAddress/summary', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    
    const user = await User.findByWallet(walletAddress);
    
    // if (!user) {
    //   return res.status(404).json({
    //     error: 'User not found'
    //   });
    // }
    
    // Get comprehensive statistics
    const [
      investmentStats,
      directReferrals,
      userLevels
    ] = await Promise.all([
      Investment.getUserTotalInvestment(walletAddress),
      User.countDocuments({ referrerAddress: walletAddress, status: 'active' }),
      Level.getUserLevels(walletAddress)
    ]);
    
    const totalInvestment = investmentStats.length > 0 ? investmentStats[0].totalAmount : 0;
    
    // Calculate total team size and earnings across all levels
    const totalTeamSize = userLevels.length;
    const totalTeamInvestment = userLevels.reduce((sum, level) => sum + level.totalInvestment, 0);
    const totalTeamEarnings = userLevels.reduce((sum, level) => sum + level.totalEarnings, 0);
    
    res.json({
      userAddress: walletAddress,
      summary: {
        personalInvestment: totalInvestment,
        personalDeposits: user.getTotalDeposits(),
        directReferrals,
        totalTeamSize,
        totalTeamInvestment,
        totalTeamEarnings,
        registrationTime: user.registrationTime,
        status: user.status
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting user summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Setup level relationships for a user
router.post('/:walletAddress/setup-levels', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();

    const user = await User.findByWallet(walletAddress);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Find all users who have this user as referrer (direct referrals)
    const directReferrals = await User.find({
      referrerAddress: walletAddress,
      status: 'active'
    });

    logger.info(`🔧 Setting up levels for ${walletAddress}, found ${directReferrals.length} direct referrals`);

    // Create level 1 relationships
    for (const referral of directReferrals) {
      // Check if level relationship already exists
      const existingLevel = await Level.findOne({
        userAddress: referral.walletAddress,
        referrerAddress: walletAddress,
        level: 1
      });

      if (!existingLevel) {
        const levelData = new Level({
          userAddress: referral.walletAddress,
          referrerAddress: walletAddress,
          level: 1,
          totalInvestment: 0,
          totalEarnings: 0,
          isActive: true,
          registrationTime: referral.registrationTime
        });

        await levelData.save();
        logger.info(`✅ Created level 1 relationship: ${referral.walletAddress} -> ${walletAddress}`);
      }
    }

    // Now create deeper level relationships (2-21)
    for (const referral of directReferrals) {
      await createDeeperLevels(referral.walletAddress, walletAddress, 2);
    }

    res.json({
      message: 'Level relationships setup completed',
      userAddress: walletAddress,
      directReferrals: directReferrals.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error setting up level relationships:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Helper function to create deeper level relationships
async function createDeeperLevels(userAddress, originalReferrer, currentLevel) {
  if (currentLevel > 21) return;

  // Find referrals of this user
  const userReferrals = await User.find({
    referrerAddress: userAddress,
    status: 'active'
  });

  for (const referral of userReferrals) {
    // Check if level relationship already exists
    const existingLevel = await Level.findOne({
      userAddress: referral.walletAddress,
      referrerAddress: originalReferrer,
      level: currentLevel
    });

    if (!existingLevel) {
      const levelData = new Level({
        userAddress: referral.walletAddress,
        referrerAddress: originalReferrer,
        level: currentLevel,
        totalInvestment: 0,
        totalEarnings: 0,
        isActive: true,
        registrationTime: referral.registrationTime
      });

      await levelData.save();
      logger.info(`✅ Created level ${currentLevel} relationship: ${referral.walletAddress} -> ${originalReferrer}`);
    }

    // Recursively create deeper levels
    await createDeeperLevels(referral.walletAddress, originalReferrer, currentLevel + 1);
  }
}

// Import users from JSON data
router.post('/import', async (req, res) => {
  try {
    const { users, clearExisting = false } = req.body;

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required'
      });
    }

    logger.info(`🌱 Starting import of ${users.length} users`, { service: 'bdc-mlm-backend' });

    // Clear existing users if requested
    if (clearExisting) {
      await User.deleteMany({});
      logger.info('🧹 Existing users cleared', { service: 'bdc-mlm-backend' });
    }

    // Transform and import users
    const transformedUsers = users.map(userData => ({
      walletAddress: userData.walletAddress.toLowerCase(),
      referrerAddress: userData.referrerAddress ? userData.referrerAddress.toLowerCase() : null,
      registrationTime: new Date(userData.registrationTime.$date || userData.registrationTime),
      status: userData.status || 'active',
      deposits: userData.deposits.map(deposit => ({
        amount: deposit.amount,
        txHash: deposit.txHash,
        blockNumber: deposit.blockNumber,
        timestamp: new Date(deposit.timestamp.$date || deposit.timestamp)
      }))
    }));

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors = [];

    // Import users one by one to handle duplicates gracefully
    for (const userData of transformedUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({
          walletAddress: userData.walletAddress
        });

        if (existingUser && !clearExisting) {
          skipCount++;
          continue;
        }

        // Create or update user
        if (existingUser && clearExisting) {
          await User.findOneAndUpdate(
            { walletAddress: userData.walletAddress },
            userData,
            { new: true }
          );
        } else {
          const newUser = new User(userData);
          await newUser.save();
        }

        successCount++;

      } catch (error) {
        errorCount++;
        errors.push({
          walletAddress: userData.walletAddress,
          error: error.message
        });
      }
    }

    logger.info(`✅ Import completed: ${successCount} success, ${skipCount} skipped, ${errorCount} errors`, { service: 'bdc-mlm-backend' });

    res.json({
      success: true,
      message: 'Users import completed',
      results: {
        total: users.length,
        successful: successCount,
        skipped: skipCount,
        errors: errorCount,
        errorDetails: errors
      }
    });

  } catch (error) {
    logger.error('❌ Error importing users:', error, { service: 'bdc-mlm-backend' });
    res.status(500).json({
      success: false,
      message: 'Error importing users',
      error: error.message
    });
  }
});

export default router;
