import logger from './logger.js';

// Error patterns to suppress (reduce noise in logs)
const SUPPRESSED_ERROR_PATTERNS = [
  'rate limit',
  'missing response for request',
  'eth_getLogs in batch triggered rate limit',
  'BAD_DATA',
  'useNewUrlParser is a deprecated option',
  'useUnifiedTopology is a deprecated option',
  'Duplicate schema index'
];

// Original console.error
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Function to check if error should be suppressed
function shouldSuppressError(message) {
  if (typeof message !== 'string') {
    message = String(message);
  }
  
  return SUPPRESSED_ERROR_PATTERNS.some(pattern => 
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

// Override console.error to suppress specific errors
console.error = function(...args) {
  const message = args.join(' ');
  
  if (shouldSuppressError(message)) {
    // Log to debug level instead of error
    logger.debug('Suppressed error:', message);
    return;
  }
  
  // Call original console.error for non-suppressed errors
  originalConsoleError.apply(console, args);
};

// Override console.warn to suppress specific warnings
console.warn = function(...args) {
  const message = args.join(' ');
  
  if (shouldSuppressError(message)) {
    // Log to debug level instead of warn
    logger.debug('Suppressed warning:', message);
    return;
  }
  
  // Call original console.warn for non-suppressed warnings
  originalConsoleWarn.apply(console, args);
};

// Function to suppress process warnings
function suppressProcessWarnings() {
  const originalEmit = process.emit;
  
  process.emit = function(name, data, ...args) {
    // Suppress specific warnings
    if (name === 'warning' && data && data.message) {
      if (shouldSuppressError(data.message)) {
        logger.debug('Suppressed process warning:', data.message);
        return false;
      }
    }
    
    return originalEmit.apply(process, arguments);
  };
}

// Function to create a clean error handler for async operations
export function createCleanErrorHandler(operationName) {
  return function(error) {
    if (shouldSuppressError(error.message)) {
      logger.debug(`${operationName} - Suppressed error:`, error.message);
      return;
    }
    
    logger.error(`${operationName} - Error:`, error.message);
  };
}

// Function to wrap async functions with clean error handling
export function withCleanErrorHandling(asyncFn, operationName) {
  return async function(...args) {
    try {
      return await asyncFn.apply(this, args);
    } catch (error) {
      const errorHandler = createCleanErrorHandler(operationName);
      errorHandler(error);
      throw error; // Re-throw for proper error propagation
    }
  };
}

// Initialize error suppression
export function initializeErrorSuppression() {
  suppressProcessWarnings();
  
  logger.info('🔇 Error suppression initialized');
  logger.info('ℹ️ Rate limiting and deprecated warnings will be suppressed');
}

// Function to temporarily disable suppression (for debugging)
export function disableErrorSuppression() {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  logger.info('🔊 Error suppression disabled');
}

// Function to re-enable suppression
export function enableErrorSuppression() {
  initializeErrorSuppression();
  logger.info('🔇 Error suppression re-enabled');
}

export default {
  initializeErrorSuppression,
  disableErrorSuppression,
  enableErrorSuppression,
  createCleanErrorHandler,
  withCleanErrorHandling,
  shouldSuppressError
};
