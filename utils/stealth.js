const logger = require('./logger');

/**
 * Apply stealth measures to avoid detection
 * @param {Object} page - Playwright page
 */
async function applyStealth(page) {
  try {
    // Override navigator properties
    await page.addInitScript(() => {
      // Override webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {
              type: "application/x-google-chrome-pdf",
              suffixes: "pdf",
              description: "Portable Document Format",
              enabledPlugin: true
            },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          }
        ]
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Add chrome runtime
      window.chrome = {
        runtime: {
          connect: () => {},
          sendMessage: () => {},
          onMessage: {
            addListener: () => {}
          }
        }
      };
    });

    // Add random mouse movements
    await addRandomMouseMovements(page);

    logger.info('Applied stealth measures successfully');
  } catch (error) {
    logger.error(`Failed to apply stealth measures: ${error.message}`);
    throw error;
  }
}

/**
 * Add random mouse movements to appear more human-like
 * @param {Object} page - Playwright page
 */
async function addRandomMouseMovements(page) {
  try {
    await page.addInitScript(() => {
      setInterval(() => {
        const event = new MouseEvent('mousemove', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: Math.floor(Math.random() * window.innerWidth),
          clientY: Math.floor(Math.random() * window.innerHeight)
        });
        document.dispatchEvent(event);
      }, Math.random() * 3000 + 2000);
    });
  } catch (error) {
    logger.warn(`Failed to add random mouse movements: ${error.message}`);
  }
}

/**
 * Add random delays between actions to appear more human-like
 * @param {number} minDelay - Minimum delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {Promise} - Promise that resolves after the delay
 */
async function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = {
  applyStealth,
  randomDelay
}; 