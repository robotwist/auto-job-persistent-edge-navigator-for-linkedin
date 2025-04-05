const logger = require('./logger');

// Rate limits per platform (requests per minute, requests per hour)
const RATE_LIMITS = {
  linkedin: { perMinute: 20, perHour: 100 },
  indeed: { perMinute: 15, perHour: 80 },
  glassdoor: { perMinute: 12, perHour: 60 },
  monster: { perMinute: 15, perHour: 75 }
};

/**
 * Rate limiter utility to prevent detection
 */
class RateLimiter {
  constructor() {
    this.requests = {};
    this.lastReset = {};
  }

  /**
   * Create a rate limiter for a specific platform
   * @param {string} platform - Platform name
   * @returns {Object} - Rate limiter instance
   */
  createLimiter(platform) {
    if (!RATE_LIMITS[platform]) {
      logger.warn(`No rate limits defined for platform: ${platform}, using default limits`);
      return {
        waitForSlot: async () => {
          await this.randomDelay(1000, 3000);
        }
      };
    }

    const limits = RATE_LIMITS[platform];
    
    // Initialize request tracking for this platform
    if (!this.requests[platform]) {
      this.requests[platform] = {
        minute: [],
        hour: []
      };
      this.lastReset[platform] = {
        minute: Date.now(),
        hour: Date.now()
      };
    }

    return {
      /**
       * Wait for a rate limit slot to become available
       * @returns {Promise<void>}
       */
      waitForSlot: async () => {
        const now = Date.now();
        
        // Clean up old requests
        this.cleanupRequests(platform, now);
        
        // Check if we're over the limit
        const minuteCount = this.requests[platform].minute.length;
        const hourCount = this.requests[platform].hour.length;
        
        if (minuteCount >= limits.perMinute) {
          const oldestMinuteRequest = this.requests[platform].minute[0];
          const waitTime = 60000 - (now - oldestMinuteRequest);
          
          if (waitTime > 0) {
            logger.info(`Rate limit reached for ${platform} (${minuteCount}/${limits.perMinute} per minute), waiting ${Math.ceil(waitTime / 1000)} seconds`);
            await this.randomDelay(waitTime, waitTime + 1000);
          }
        }
        
        if (hourCount >= limits.perHour) {
          const oldestHourRequest = this.requests[platform].hour[0];
          const waitTime = 3600000 - (now - oldestHourRequest);
          
          if (waitTime > 0) {
            logger.info(`Rate limit reached for ${platform} (${hourCount}/${limits.perHour} per hour), waiting ${Math.ceil(waitTime / 1000)} seconds`);
            await this.randomDelay(waitTime, waitTime + 1000);
          }
        }
        
        // Add this request to the tracking
        this.requests[platform].minute.push(now);
        this.requests[platform].hour.push(now);
        
        // Add a small random delay to make the pattern less predictable
        await this.randomDelay(500, 2000);
      }
    };
  }

  /**
   * Clean up old requests
   * @param {string} platform - Platform name
   * @param {number} now - Current timestamp
   */
  cleanupRequests(platform, now) {
    const minuteAgo = now - 60000;
    const hourAgo = now - 3600000;
    
    // Remove requests older than a minute
    this.requests[platform].minute = this.requests[platform].minute.filter(time => time > minuteAgo);
    
    // Remove requests older than an hour
    this.requests[platform].hour = this.requests[platform].hour.filter(time => time > hourAgo);
  }

  /**
   * Add a random delay
   * @param {number} min - Minimum delay in milliseconds
   * @param {number} max - Maximum delay in milliseconds
   * @returns {Promise<void>}
   */
  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Create a singleton instance
const rateLimiter = new RateLimiter();

// Export a function to create platform-specific limiters
module.exports = platform => rateLimiter.createLimiter(platform); 