import { ethers } from 'ethers';
import User from '../models/User.js';
import Level from '../models/Level.js';
import Investment from '../models/Investment.js';
import logger from '../utils/logger.js';
import rpcManager from '../utils/rpcManager.js';

// Contract ABI (simplified for events we need)
const DWC_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "referrer", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "userId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "referrerId", "type": "uint256" }
    ],
    "name": "Registration",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "addr", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "token", "type": "uint256" }
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" },
      { "indexed": false, "internalType": "uint8", "name": "level", "type": "uint8" },
      { "indexed": false, "internalType": "uint8", "name": "Type", "type": "uint8" }
    ],
    "name": "Transaction",
    "type": "event"
  }
];

const CONTRACT_ADDRESS = process.env.DWC_CONTRACT_ADDRESS || '0xa204d59852fabde359aaf4b31b59eb5b0338c312';
const RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/';

class EventListener {
  constructor() {
    this.rpcManager = rpcManager;
    this.provider = null;
    this.contract = null;
    this.isListening = false;
    this.lastProcessedBlock = 0;
    this.isProcessingHistorical = false;
  }

  async start() {
    try {
      logger.info('🎧 Starting contract event listener...');

      // Initialize provider and contract using RPC manager
      this.provider = await this.rpcManager.getProvider();
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, DWC_ABI, this.provider);

      // Get the latest block number using RPC manager
      const latestBlock = await this.rpcManager.getBlockNumber();
      this.lastProcessedBlock = latestBlock;

      logger.info(`📊 Latest block: ${latestBlock}`);
      logger.info(`📍 Contract address: ${CONTRACT_ADDRESS}`);

      // Listen to Registration events
      this.contract.on('Registration', async (user, referrer, userId, referrerId, event) => {
        await this.handleRegistrationEvent(user, referrer, userId, referrerId, event);
      });

      // Listen to Deposit events
      this.contract.on('Deposit', async (addr, amount, token, event) => {
        await this.handleDepositEvent(addr, amount, token, event);
      });

      // Listen to Transaction events (for income tracking)
      this.contract.on('Transaction', async (user, from, value, level, type, event) => {
        await this.handleTransactionEvent(user, from, value, level, type, event);
      });

      this.isListening = true;
      logger.info('✅ Event listener started successfully');

      // Skip historical events processing to avoid rate limiting
      // Only process historical events if explicitly enabled
      if (process.env.PROCESS_HISTORICAL_EVENTS === 'true') {
        logger.info('📚 Historical events processing enabled');
        await this.processHistoricalEvents();
      } else {
        logger.info('📚 Historical events processing disabled (to avoid rate limiting)');
      }

    } catch (error) {
      logger.error('❌ Error starting event listener:', error);
      // Don't throw error, just log it to prevent server crash
    }
  }

  async handleRegistrationEvent(userAddress, referrerAddress, userId, referrerId, event) {
    try {
      logger.info(`👤 New Registration: ${userAddress} referred by ${referrerAddress}`);
      
      const blockNumber = event.blockNumber;
      const txHash = event.transactionHash;
      
      // Check if user already exists
      let user = await User.findByWallet(userAddress);
      
      if (!user) {
        // Create new user
        user = new User({
          walletAddress: userAddress.toLowerCase(),
          referrerAddress: referrerAddress.toLowerCase(),
          registrationTime: new Date()
        });
        
        await user.save();
        logger.info(`✅ User created: ${userAddress}`);
      } else {
        // Update existing user
        user.referrerAddress = referrerAddress.toLowerCase();
        await user.save();
        logger.info(`🔄 User updated: ${userAddress}`);
      }
      
      // Create level relationships (1-21 levels)
      await this.createLevelRelationships(userAddress, referrerAddress);
      
    } catch (error) {
      logger.error('❌ Error handling registration event:', error);
    }
  }

  async handleDepositEvent(userAddress, amount, token, event) {
    try {
      const amountInEther = ethers.formatEther(amount);
      logger.info(`💰 New Deposit: ${userAddress} deposited ${amountInEther} tokens`);
      
      const blockNumber = event.blockNumber;
      const txHash = event.transactionHash;
      
      // Find or create user
      let user = await User.findByWallet(userAddress);
      
      if (!user) {
        user = new User({
          walletAddress: userAddress.toLowerCase(),
          registrationTime: new Date()
        });
        await user.save();
      }
      
      // Add deposit to user
      await user.addDeposit(parseFloat(amountInEther), txHash, blockNumber);
      
      // Create investment record
      const investment = new Investment({
        userAddress: userAddress.toLowerCase(),
        amount: parseFloat(amountInEther),
        txHash,
        blockNumber,
        type: token === 0 ? 'USDT' : 'BDC',
        investmentTime: new Date()
      });
      
      await investment.save();
      
      // Update level investments
      await this.updateLevelInvestments(userAddress, parseFloat(amountInEther));
      
      logger.info(`✅ Deposit processed: ${userAddress} - ${amountInEther}`);
      
    } catch (error) {
      logger.error('❌ Error handling deposit event:', error);
    }
  }

  async handleTransactionEvent(userAddress, fromAddress, value, level, type, event) {
    try {
      const valueInEther = ethers.formatEther(value);
      logger.info(`💸 Transaction: ${fromAddress} -> ${userAddress}, Level: ${level}, Amount: ${valueInEther}`);
      
      // Update level earnings
      await this.updateLevelEarnings(userAddress, fromAddress, parseFloat(valueInEther), level);
      
    } catch (error) {
      logger.error('❌ Error handling transaction event:', error);
    }
  }

  async createLevelRelationships(userAddress, referrerAddress) {
    try {
      // Find the referrer's upline chain
      const uplineChain = await this.getUplineChain(referrerAddress, 21);
      
      // Create level relationships for each upline (max 21 levels)
      for (let i = 0; i < uplineChain.length && i < 21; i++) {
        const level = i + 1;
        const uplineAddress = uplineChain[i];
        
        // Check if level relationship already exists
        const existingLevel = await Level.findOne({
          userAddress: userAddress.toLowerCase(),
          referrerAddress: uplineAddress.toLowerCase(),
          level
        });
        
        if (!existingLevel) {
          const levelRelation = new Level({
            userAddress: userAddress.toLowerCase(),
            referrerAddress: uplineAddress.toLowerCase(),
            level,
            registrationTime: new Date()
          });
          
          await levelRelation.save();
          logger.info(`📊 Level ${level} relationship created: ${userAddress} -> ${uplineAddress}`);
        }
      }
      
    } catch (error) {
      logger.error('❌ Error creating level relationships:', error);
    }
  }

  async getUplineChain(userAddress, maxLevels = 21) {
    const uplineChain = [];
    let currentAddress = userAddress.toLowerCase();
    
    for (let i = 0; i < maxLevels; i++) {
      const user = await User.findByWallet(currentAddress);
      
      if (!user || !user.referrerAddress) {
        break;
      }
      
      uplineChain.push(user.referrerAddress);
      currentAddress = user.referrerAddress;
    }
    
    return uplineChain;
  }

  async updateLevelInvestments(userAddress, amount) {
    try {
      // Find all level relationships where this user is the downline
      const levelRelations = await Level.find({
        userAddress: userAddress.toLowerCase(),
        isActive: true
      });
      
      // Update investment for each level
      for (const relation of levelRelations) {
        await relation.addInvestment(amount);
      }
      
    } catch (error) {
      logger.error('❌ Error updating level investments:', error);
    }
  }

  async updateLevelEarnings(userAddress, fromAddress, amount, level) {
    try {
      // Find the level relationship
      const levelRelation = await Level.findOne({
        userAddress: fromAddress.toLowerCase(),
        referrerAddress: userAddress.toLowerCase(),
        level: parseInt(level),
        isActive: true
      });
      
      if (levelRelation) {
        await levelRelation.addEarnings(amount);
        logger.info(`💰 Level ${level} earnings updated: ${userAddress} earned ${amount} from ${fromAddress}`);
      }
      
    } catch (error) {
      logger.error('❌ Error updating level earnings:', error);
    }
  }

  async processHistoricalEvents() {
    if (this.isProcessingHistorical) {
      logger.info('⏳ Historical events processing already in progress, skipping...');
      return;
    }

    this.isProcessingHistorical = true;

    try {
      logger.info('📚 Processing historical events...');

      // Get start block from environment or use a default
      const startBlock = parseInt(process.env.START_BLOCK) || 0;
      const currentBlock = await this.rpcManager.getBlockNumber();
      const batchSize = parseInt(process.env.BATCH_SIZE) || 100; // Reduced batch size

      logger.info(`📊 Processing blocks ${startBlock} to ${currentBlock}`);

      // Process in smaller batches to avoid RPC limits
      for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += batchSize) {
        const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);

        logger.info(`🔄 Processing batch: ${fromBlock} to ${toBlock}`);

        try {
          // Use RPC manager for getting logs with retry logic
          const registrationFilter = {
            address: CONTRACT_ADDRESS,
            topics: [ethers.id("Registration(address,address,uint256,uint256)")],
            fromBlock: ethers.toBeHex(fromBlock),
            toBlock: ethers.toBeHex(toBlock)
          };

          const depositFilter = {
            address: CONTRACT_ADDRESS,
            topics: [ethers.id("Deposit(address,uint256,address)")],
            fromBlock: ethers.toBeHex(fromBlock),
            toBlock: ethers.toBeHex(toBlock)
          };

          // Get events using RPC manager with retry logic
          const registrationLogs = await this.rpcManager.getLogs(registrationFilter);
          const depositLogs = await this.rpcManager.getLogs(depositFilter);

          // Process registration events
          for (const log of registrationLogs) {
            try {
              const parsedLog = this.contract.interface.parseLog(log);
              if (parsedLog) {
                await this.handleRegistrationEvent(
                  parsedLog.args.user,
                  parsedLog.args.referrer,
                  parsedLog.args.userId,
                  parsedLog.args.referrerId,
                  { blockNumber: log.blockNumber, transactionHash: log.transactionHash }
                );
              }
            } catch (parseError) {
              logger.debug(`⚠️ Failed to parse registration log: ${parseError.message}`);
            }
          }

          // Process deposit events
          for (const log of depositLogs) {
            try {
              const parsedLog = this.contract.interface.parseLog(log);
              if (parsedLog) {
                await this.handleDepositEvent(
                  parsedLog.args.addr,
                  parsedLog.args.amount,
                  parsedLog.args.token,
                  { blockNumber: log.blockNumber, transactionHash: log.transactionHash }
                );
              }
            } catch (parseError) {
              logger.debug(`⚠️ Failed to parse deposit log: ${parseError.message}`);
            }
          }

        } catch (batchError) {
          // Log the error but continue with next batch
          logger.warn(`⚠️ Error processing batch ${fromBlock}-${toBlock}: ${batchError.message}`);

          // If it's a rate limit error, wait longer
          if (batchError.message.includes('rate limit') || batchError.code === -32005) {
            logger.info('⏳ Rate limit detected, waiting 10 seconds before continuing...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }

        // Longer delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.info('✅ Historical events processing completed');

    } catch (error) {
      // Suppress the detailed error logs that are causing noise
      if (error.message.includes('rate limit') || error.code === -32005) {
        logger.warn('⚠️ Historical events processing stopped due to rate limiting');
      } else {
        logger.error('❌ Error processing historical events:', error.message);
      }
    } finally {
      this.isProcessingHistorical = false;
    }
  }

  async stop() {
    if (this.isListening) {
      this.contract.removeAllListeners();
      this.isListening = false;
      logger.info('🛑 Event listener stopped');
    }
  }
}

let eventListener = null;

export async function startEventListener() {
  if (!eventListener) {
    eventListener = new EventListener();
    await eventListener.start();
  }
  return eventListener;
}

export async function stopEventListener() {
  if (eventListener) {
    await eventListener.stop();
    eventListener = null;
  }
}

export default EventListener;
