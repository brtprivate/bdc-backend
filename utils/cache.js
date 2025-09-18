import logger from './logger.js';

// Simple in-memory cache implementation without external dependencies
class SimpleCache {
  constructor(ttl = 300000) { // Default 5 minutes
    this.cache = new Map();
    this.ttl = ttl;

    // Clean expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  set(key, value, customTtl = null) {
    const expiry = Date.now() + (customTtl || this.ttl);
    this.cache.set(key, { value, expiry });
    return true;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  getStats() {
    return {
      keys: this.cache.size,
      hits: 0, // Simple implementation doesn't track hits
      misses: 0
    };
  }
}

class CacheManager {
  constructor() {
    // Default cache with 5 minute TTL
    this.defaultCache = new SimpleCache(300000); // 5 minutes

    // Long-term cache with 30 minute TTL for expensive queries
    this.longTermCache = new SimpleCache(1800000); // 30 minutes

    // Short-term cache with 1 minute TTL for frequently changing data
    this.shortTermCache = new SimpleCache(60000); // 1 minute

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Simple cache doesn't have events, but we can log operations
    if (process.env.NODE_ENV === 'development') {
      logger.debug('🔄 Cache manager initialized with simple in-memory cache');
    }
  }

  // Generate cache key from parameters
  generateKey(prefix, ...params) {
    return `${prefix}:${params.join(':')}`;
  }

  // Default cache methods
  get(key) {
    const value = this.defaultCache.get(key);
    if (value !== undefined && process.env.NODE_ENV === 'development') {
      logger.debug(`🎯 Cache HIT: ${key}`);
    }
    return value;
  }

  set(key, value, ttl = null) {
    if (ttl) {
      return this.defaultCache.set(key, value, ttl);
    }
    return this.defaultCache.set(key, value);
  }

  del(key) {
    return this.defaultCache.del(key);
  }

  // Long-term cache methods (for expensive queries like referral trees)
  getLongTerm(key) {
    const value = this.longTermCache.get(key);
    if (value !== undefined && process.env.NODE_ENV === 'development') {
      logger.debug(`🎯 Long-term Cache HIT: ${key}`);
    }
    return value;
  }

  setLongTerm(key, value, ttl = null) {
    if (ttl) {
      return this.longTermCache.set(key, value, ttl);
    }
    return this.longTermCache.set(key, value);
  }

  delLongTerm(key) {
    return this.longTermCache.del(key);
  }

  // Short-term cache methods (for frequently changing data)
  getShortTerm(key) {
    const value = this.shortTermCache.get(key);
    if (value !== undefined && process.env.NODE_ENV === 'development') {
      logger.debug(`🎯 Short-term Cache HIT: ${key}`);
    }
    return value;
  }

  setShortTerm(key, value, ttl = null) {
    if (ttl) {
      return this.shortTermCache.set(key, value, ttl);
    }
    return this.shortTermCache.set(key, value);
  }

  delShortTerm(key) {
    return this.shortTermCache.del(key);
  }

  // Clear all caches
  clearAll() {
    this.defaultCache.flushAll();
    this.longTermCache.flushAll();
    this.shortTermCache.flushAll();
    logger.info('🧹 All caches cleared');
  }

  // Clear cache by pattern
  clearByPattern(pattern) {
    const keys = this.defaultCache.keys();
    const longTermKeys = this.longTermCache.keys();
    const shortTermKeys = this.shortTermCache.keys();
    
    const regex = new RegExp(pattern);
    
    keys.filter(key => regex.test(key)).forEach(key => this.defaultCache.del(key));
    longTermKeys.filter(key => regex.test(key)).forEach(key => this.longTermCache.del(key));
    shortTermKeys.filter(key => regex.test(key)).forEach(key => this.shortTermCache.del(key));
    
    logger.info(`🧹 Cleared cache entries matching pattern: ${pattern}`);
  }

  // Get cache statistics
  getStats() {
    return {
      default: this.defaultCache.getStats(),
      longTerm: this.longTermCache.getStats(),
      shortTerm: this.shortTermCache.getStats()
    };
  }

  // Wrapper for caching expensive operations
  async cached(key, asyncFunction, ttl = null, cacheType = 'default') {
    let cachedValue;
    
    switch (cacheType) {
      case 'longTerm':
        cachedValue = this.getLongTerm(key);
        break;
      case 'shortTerm':
        cachedValue = this.getShortTerm(key);
        break;
      default:
        cachedValue = this.get(key);
    }
    
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    try {
      const result = await asyncFunction();
      
      switch (cacheType) {
        case 'longTerm':
          this.setLongTerm(key, result, ttl);
          break;
        case 'shortTerm':
          this.setShortTerm(key, result, ttl);
          break;
        default:
          this.set(key, result, ttl);
      }
      
      return result;
    } catch (error) {
      logger.error(`❌ Error in cached operation for key ${key}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

export default cacheManager;
