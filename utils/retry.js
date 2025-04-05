const logger = require('./logger');

/**
 * Retry options
 * @typedef {Object} RetryOptions
 * @property {string} operationName - Name of the operation being retried
 * @property {number} maxAttempts - Maximum number of retry attempts
 * @property {number} initialDelay - Initial delay in milliseconds
 * @property {number} maxDelay - Maximum delay in milliseconds
 * @property {number} backoffFactor - Factor to increase delay by on each retry
 * @property {Function} shouldRetry - Function to determine if an error should be retried
 */

/**
 * Default retry options
 * @type {RetryOptions}
 */
const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  shouldRetry: (error) => {
    // Retry on network errors
    if (error.name === 'NetworkError') return true;
    
    // Retry on timeouts
    if (error.name === 'TimeoutError') return true;
    
    // Retry on server errors (5xx)
    if (error.status && error.status >= 500) return true;
    
    // Retry on specific error messages
    const retryableMessages = [
      'net::ERR_CONNECTION_RESET',
      'net::ERR_CONNECTION_ABORTED',
      'net::ERR_NETWORK',
      'net::ERR_TIMED_OUT'
    ];
    
    return retryableMessages.some(msg => 
      error.message && error.message.includes(msg)
    );
  }
};

/**
 * Execute a function with retry logic
 * @param {Function} operation - Function to execute
 * @param {RetryOptions} options - Retry options
 * @returns {Promise<any>} - Result of the operation
 */
async function withRetry(operation, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 1;
  let delay = config.initialDelay;

  while (attempt <= config.maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      // Check if we should retry
      if (!config.shouldRetry(error)) {
        throw error;
      }

      // Check if we've reached max attempts
      if (attempt === config.maxAttempts) {
        logger.error(`Operation failed after ${attempt} attempts: ${error.message}`);
        throw error;
      }

      // Log retry attempt
      logger.warn(`Attempt ${attempt} failed: ${error.message}`);
      logger.info(`Retrying in ${delay}ms...`);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay for next attempt
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
      attempt++;
    }
  }
}

module.exports = {
  withRetry
}; 