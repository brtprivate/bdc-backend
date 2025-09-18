import { ethers } from 'ethers';
import logger from './logger.js';

class RpcManager {
  constructor() {
    // Default RPC URLs if environment variables are not set
    this.rpcUrls = [
      process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
      process.env.BSC_RPC_URL_BACKUP1 || 'https://bsc-dataseed2.binance.org/',
      process.env.BSC_RPC_URL_BACKUP2 || 'https://bsc-dataseed3.binance.org/',
      process.env.BSC_RPC_URL_BACKUP3 || 'https://bsc-dataseed4.binance.org/',
      process.env.BSC_RPC_URL_BACKUP4 || 'https://rpc.ankr.com/bsc',
      process.env.BSC_RPC_URL_BACKUP5 || 'https://bsc-dataseed.binance.org/'
    ].filter(url => url && url.trim() !== '');

    this.currentProviderIndex = 0;
    this.providers = [];
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY) || 5000;
    this.requestCounts = new Map();
    this.lastRequestTime = new Map();
    this.rateLimitDelay = 1000; // 1 second between requests
    this.initialized = false;

    // Only initialize if event listener is enabled
    if (process.env.ENABLE_EVENT_LISTENER === 'true') {
      this.initializeProviders();
    } else {
      logger.info('🔇 RPC Manager not initialized (event listener disabled)');
    }
  }

  initializeProviders() {
    if (this.initialized) {
      return;
    }

    this.providers = this.rpcUrls.map((url, index) => {
      try {
        const provider = new ethers.JsonRpcProvider(url, {
          chainId: parseInt(process.env.CHAIN_ID) || 56,
          name: 'BSC'
        });

        // Set request timeout
        provider.pollingInterval = 12000; // 12 seconds

        logger.info(`✅ RPC Provider ${index + 1} initialized: ${url.substring(0, 30)}...`);
        return provider;
      } catch (error) {
        logger.error(`❌ Failed to initialize RPC Provider ${index + 1}: ${error.message}`);
        return null;
      }
    }).filter(provider => provider !== null);

    if (this.providers.length === 0) {
      throw new Error('No valid RPC providers available');
    }

    this.initialized = true;
    logger.info(`🔗 RPC Manager initialized with ${this.providers.length} providers`);
  }

  async getProvider() {
    if (this.providers.length === 0) {
      throw new Error('No RPC providers available');
    }

    // Rate limiting check
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(this.currentProviderIndex) || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime.set(this.currentProviderIndex, Date.now());
    return this.providers[this.currentProviderIndex];
  }

  async executeWithRetry(operation, operationName = 'RPC Operation') {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      for (let providerIndex = 0; providerIndex < this.providers.length; providerIndex++) {
        try {
          this.currentProviderIndex = providerIndex;
          const provider = await this.getProvider();
          
          logger.debug(`🔄 ${operationName} - Attempt ${attempt + 1}, Provider ${providerIndex + 1}`);
          
          const result = await operation(provider);
          
          // Reset to first provider on success
          if (providerIndex !== 0) {
            this.currentProviderIndex = 0;
            logger.info(`✅ ${operationName} successful with backup provider ${providerIndex + 1}`);
          }
          
          return result;
          
        } catch (error) {
          lastError = error;
          
          // Check if it's a rate limit error
          if (error.message.includes('rate limit') || error.code === -32005) {
            // Only log rate limit warnings in debug mode to reduce noise
            logger.debug(`⚠️ Rate limit hit on provider ${providerIndex + 1}`);

            // If this is the last provider, wait longer before retrying
            if (providerIndex === this.providers.length - 1) {
              logger.debug(`⏳ All providers rate limited, waiting ${this.retryDelay}ms...`);
              await this.sleep(this.retryDelay);
            }
            continue;
          }

          // For other errors, try next provider immediately
          logger.debug(`⚠️ Provider ${providerIndex + 1} failed: ${error.message}`);
        }
      }
      
      // If all providers failed, wait before next attempt
      if (attempt < this.maxRetries - 1) {
        logger.debug(`⏳ All providers failed, waiting ${this.retryDelay}ms before retry ${attempt + 2}...`);
        await this.sleep(this.retryDelay);
      }
    }

    // Only log final failure if it's not a rate limit error
    if (!lastError.message.includes('rate limit') && lastError.code !== -32005) {
      logger.error(`❌ ${operationName} failed after ${this.maxRetries} attempts with all providers: ${lastError.message}`);
    } else {
      logger.debug(`❌ ${operationName} failed due to rate limiting after ${this.maxRetries} attempts`);
    }
    throw lastError;
  }

  async getLogs(filter) {
    return this.executeWithRetry(
      async (provider) => {
        return await provider.getLogs(filter);
      },
      'getLogs'
    );
  }

  async getBlockNumber() {
    return this.executeWithRetry(
      async (provider) => {
        return await provider.getBlockNumber();
      },
      'getBlockNumber'
    );
  }

  async getBlock(blockNumber) {
    return this.executeWithRetry(
      async (provider) => {
        return await provider.getBlock(blockNumber);
      },
      'getBlock'
    );
  }

  async getTransaction(txHash) {
    return this.executeWithRetry(
      async (provider) => {
        return await provider.getTransaction(txHash);
      },
      'getTransaction'
    );
  }

  async getTransactionReceipt(txHash) {
    return this.executeWithRetry(
      async (provider) => {
        return await provider.getTransactionReceipt(txHash);
      },
      'getTransactionReceipt'
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      totalProviders: this.providers.length,
      currentProvider: this.currentProviderIndex + 1,
      rpcUrls: this.rpcUrls.map((url, index) => ({
        index: index + 1,
        url: url.substring(0, 30) + '...',
        active: index === this.currentProviderIndex
      }))
    };
  }
}

// Create singleton instance (lazy initialization)
let rpcManager = null;

export default {
  getInstance() {
    if (!rpcManager) {
      rpcManager = new RpcManager();
    }
    return rpcManager;
  },

  // Direct access for backward compatibility
  get currentProviderIndex() {
    return this.getInstance().currentProviderIndex;
  },

  async getProvider() {
    return this.getInstance().getProvider();
  },

  async executeWithRetry(operation, operationName) {
    return this.getInstance().executeWithRetry(operation, operationName);
  },

  async getLogs(filter) {
    return this.getInstance().getLogs(filter);
  },

  async getBlockNumber() {
    return this.getInstance().getBlockNumber();
  },

  async getBlock(blockNumber) {
    return this.getInstance().getBlock(blockNumber);
  },

  async getTransaction(txHash) {
    return this.getInstance().getTransaction(txHash);
  },

  async getTransactionReceipt(txHash) {
    return this.getInstance().getTransactionReceipt(txHash);
  },

  getStats() {
    return this.getInstance().getStats();
  }
};
