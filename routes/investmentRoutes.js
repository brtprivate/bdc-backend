import express from 'express';
import Investment from '../models/Investment.js';
import User from '../models/User.js';
import Level from '../models/Level.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Create new investment record
router.post('/', async (req, res) => {
  try {
    const { userAddress, amount, txHash, blockNumber, type } = req.body;
    
    if (!userAddress || !amount || !txHash) {
      return res.status(400).json({
        error: 'Missing required fields: userAddress, amount, txHash'
      });
    }
    
    // Check if investment already exists (prevent duplicates)
    const existingInvestment = await Investment.findOne({ txHash });
    if (existingInvestment) {
      return res.status(409).json({
        error: 'Investment with this transaction hash already exists',
        investment: existingInvestment
      });
    }
    
    // Validate user exists
    const user = await User.findByWallet(userAddress);
    if (!user) {
      return res.status(404).json({
        error: 'User not found. Please register first.'
      });
    }
    
    // Create investment record
    const investment = new Investment({
      userAddress: userAddress.toLowerCase(),
      amount: parseFloat(amount),
      txHash,
      blockNumber: blockNumber || 0,
      type: type || 'USDT',
      status: 'confirmed',
      investmentTime: new Date()
    });
    
    await investment.save();

    // Update user deposits array
    await user.addDeposit(parseFloat(amount), txHash, blockNumber || 0);

    // Update level relationships with investment data
    await updateLevelInvestments(userAddress, parseFloat(amount));

    logger.info(`✅ Investment recorded: ${userAddress} - ${amount} ${type || 'USDT'}`);

    res.status(201).json({
      message: 'Investment recorded successfully',
      investment: {
        userAddress: investment.userAddress,
        amount: investment.amount,
        txHash: investment.txHash,
        blockNumber: investment.blockNumber,
        type: investment.type,
        status: investment.status,
        investmentTime: investment.investmentTime
      }
    });
    
  } catch (error) {
    logger.error('Error recording investment:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get all investments with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const [investments, total] = await Promise.all([
      Investment.find({ status: 'confirmed' })
        .sort({ investmentTime: -1 })
        .skip(skip)
        .limit(limit),
      Investment.countDocuments({ status: 'confirmed' })
    ]);
    
    res.json({
      investments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalInvestments: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting investments:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get investment by transaction hash
router.get('/tx/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    
    const investment = await Investment.findOne({ txHash });
    
    if (!investment) {
      return res.status(404).json({
        error: 'Investment not found'
      });
    }
    
    res.json({
      investment,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting investment by tx hash:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get investment statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalStats, typeStats, dailyStats] = await Promise.all([
      Investment.getTotalInvestmentStats(),
      Investment.getInvestmentStatsByType(),
      Investment.getDailyInvestmentReport(30)
    ]);
    
    res.json({
      totalStats: totalStats[0] || {
        totalAmount: 0,
        totalInvestments: 0,
        averageAmount: 0,
        uniqueUsers: 0
      },
      typeStats,
      dailyStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting investment statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Update investment status
router.patch('/:txHash/status', async (req, res) => {
  try {
    const { txHash } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'confirmed', 'failed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be pending, confirmed, or failed.'
      });
    }
    
    const investment = await Investment.findOne({ txHash });
    
    if (!investment) {
      return res.status(404).json({
        error: 'Investment not found'
      });
    }
    
    investment.status = status;
    await investment.save();
    
    logger.info(`🔄 Investment status updated: ${txHash} -> ${status}`);
    
    res.json({
      message: 'Investment status updated successfully',
      investment: {
        txHash: investment.txHash,
        status: investment.status,
        userAddress: investment.userAddress,
        amount: investment.amount
      }
    });
    
  } catch (error) {
    logger.error('Error updating investment status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Helper function to update level investments
async function updateLevelInvestments(userAddress, investmentAmount) {
  try {
    logger.info(`🔄 Updating level investments for ${userAddress} with amount ${investmentAmount}`);

    // Find the user who made the investment
    const investor = await User.findByWallet(userAddress);
    if (!investor || !investor.referrerAddress) {
      logger.info(`ℹ️ No referrer found for ${userAddress}, skipping level updates`);
      return;
    }

    // Start from the direct referrer and go up 21 levels
    let currentReferrer = investor.referrerAddress;
    let currentLevel = 1;

    while (currentReferrer && currentLevel <= 21) {
      // Find or create level relationship
      let levelRelation = await Level.findOne({
        userAddress: userAddress,
        referrerAddress: currentReferrer,
        level: currentLevel
      });

      if (!levelRelation) {
        // Create new level relationship
        levelRelation = new Level({
          userAddress: userAddress,
          referrerAddress: currentReferrer,
          level: currentLevel,
          totalInvestment: investmentAmount,
          totalEarnings: 0, // Will be calculated based on commission rules
          isActive: true,
          registrationTime: investor.registrationTime
        });

        logger.info(`✅ Created level ${currentLevel} relationship: ${userAddress} -> ${currentReferrer}`);
      } else {
        // Update existing level relationship
        levelRelation.totalInvestment += investmentAmount;
        logger.info(`📈 Updated level ${currentLevel} investment: ${userAddress} -> ${currentReferrer} (+${investmentAmount})`);
      }

      await levelRelation.save();

      // Move to next level (find referrer's referrer)
      const referrerUser = await User.findByWallet(currentReferrer);
      if (referrerUser && referrerUser.referrerAddress) {
        currentReferrer = referrerUser.referrerAddress;
        currentLevel++;
      } else {
        // No more referrers in the chain
        break;
      }
    }

    logger.info(`✅ Level investments updated for ${userAddress} up to level ${currentLevel - 1}`);

  } catch (error) {
    logger.error('Error updating level investments:', error);
  }
}

export default router;
