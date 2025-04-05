const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const browser = require('./browser');
const { withRetry } = require('./retry');

// Constants
const STATE_FILE = platform => `${platform}_state.json`;
const COOKIES_FILE = platform => `${platform}_cookies.json`;
const SESSION_ROTATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_LOGIN_ATTEMPTS = 3;
const LOGIN_TIMEOUT = 30000;

// Platform-specific selectors
const SELECTORS = {
  linkedin: {
    username: '#username',
    password: '#password',
    submit: 'button[type="submit"]',
    verification: '#pin-input',
    error: '.alert-content'
  },
  indeed: {
    username: '#email-address-input',
    password: '#password-input',
    submit: 'button[type="submit"]',
    verification: '#verification-code-input',
    error: '.error-message'
  },
  glassdoor: {
    loginPage: 'https://www.glassdoor.com/profile/login_input.htm',
    username: '#inlineUserEmail',
    password: '#inlineUserPassword',
    submitButton: 'button[type="submit"]',
    verifyLogin: '.member-nav'
  },
  monster: {
    loginPage: 'https://www.monster.com/profile/sign-in',
    username: '#email',
    password: '#password',
    submitButton: 'button[type="submit"]',
    verifyLogin: '.profile-nav'
  }
};

/**
 * Saves the browser session state and cookies to files
 * @param {BrowserContext} context - Playwright browser context
 * @param {string} platform - Job platform name
 */
async function saveSession(context, platform) {
  try {
    // Create sessions directory if it doesn't exist
    const sessionsDir = path.join(process.cwd(), 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    
    // Save storage state with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const statePath = path.join(sessionsDir, `${platform}_state_${timestamp}.json`);
    const cookiesPath = path.join(sessionsDir, `${platform}_cookies_${timestamp}.json`);
    
    const state = await context.storageState();
    await fs.writeFile(statePath, JSON.stringify(state));
    logger.info(`Saved storage state for ${platform} at ${statePath}`);

    // Save cookies separately
    const cookies = state.cookies || [];
    await fs.writeFile(cookiesPath, JSON.stringify(cookies));
    logger.info(`Saved cookies for ${platform} at ${cookiesPath}`);
    
    // Clean up old sessions (keep only the 5 most recent)
    await cleanupOldSessions(platform, sessionsDir);
  } catch (error) {
    logger.error(`Error saving session for ${platform}: ${error}`);
  }
}

/**
 * Cleans up old session files, keeping only the 5 most recent
 * @param {string} platform - Job platform name
 * @param {string} sessionsDir - Directory containing session files
 */
async function cleanupOldSessions(platform, sessionsDir) {
  try {
    // Get all state files for this platform
    const files = await fs.readdir(sessionsDir);
    const platformFiles = files.filter(file => 
      file.startsWith(`${platform}_state_`) && file.endsWith('.json')
    );
    
    // Sort by timestamp (newest first)
    platformFiles.sort().reverse();
    
    // Remove all but the 5 most recent
    if (platformFiles.length > 5) {
      for (let i = 5; i < platformFiles.length; i++) {
        const stateFile = path.join(sessionsDir, platformFiles[i]);
        const cookiesFile = path.join(sessionsDir, platformFiles[i].replace('state', 'cookies'));
        
        await fs.unlink(stateFile).catch(() => {});
        await fs.unlink(cookiesFile).catch(() => {});
        
        logger.info(`Removed old session file: ${stateFile}`);
      }
    }
  } catch (error) {
    logger.warn(`Error cleaning up old sessions: ${error}`);
  }
}

/**
 * Loads the most recent valid session for a platform
 * @param {Browser} browser - Playwright browser instance
 * @param {string} platform - Job platform name
 * @returns {Promise<BrowserContext>} - Browser context with loaded session
 */
async function loadSession(browser, platform) {
  try {
    const sessionsDir = path.join(process.cwd(), 'sessions');
    
    // Check if sessions directory exists
    try {
      await fs.access(sessionsDir);
    } catch {
      logger.info(`No sessions directory found for ${platform}, creating new context`);
      return await createNewContext(browser);
    }
    
    // Get all state files for this platform
    const files = await fs.readdir(sessionsDir);
    const platformFiles = files.filter(file => 
      file.startsWith(`${platform}_state_`) && file.endsWith('.json')
    );
    
    // Sort by timestamp (newest first)
    platformFiles.sort().reverse();
    
    // Try each session file until we find a valid one
    for (const stateFile of platformFiles) {
      try {
        const statePath = path.join(sessionsDir, stateFile);
        const cookiesPath = path.join(sessionsDir, stateFile.replace('state', 'cookies'));
        
        // Check if session is too old (older than 24 hours)
        const fileStats = await fs.stat(statePath);
        const fileAge = Date.now() - fileStats.mtime.getTime();
        
        if (fileAge > SESSION_ROTATION_INTERVAL) {
          logger.info(`Session file ${stateFile} is too old (${Math.round(fileAge / 3600000)} hours), trying next`);
          continue;
        }
        
        logger.info(`Loading session from ${stateFile}`);
        const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
        const context = await browser.newContext({ 
          storageState: state,
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        
        // Load cookies if they exist
        try {
          const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf8'));
          if (cookies && cookies.length > 0) {
            await context.addCookies(cookies);
            logger.info(`Added ${cookies.length} cookies for ${platform}`);
          }
        } catch (error) {
          logger.warn(`Could not load cookies for ${platform}: ${error}`);
        }
        
        return context;
      } catch (error) {
        logger.warn(`Error loading session from ${stateFile}: ${error}`);
        // Continue to the next file
      }
    }
    
    // If we get here, no valid session was found
    logger.info(`No valid session found for ${platform}, creating new context`);
    return await createNewContext(browser);
  } catch (error) {
    logger.error(`Error loading session for ${platform}: ${error}`);
    return await createNewContext(browser);
  }
}

/**
 * Creates a new browser context with default settings
 * @param {Browser} browser - Playwright browser instance
 * @returns {Promise<BrowserContext>} - New browser context
 */
async function createNewContext(browser) {
  return await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
}

/**
 * Verifies if the user is logged in to a platform
 * @param {Page} page - Playwright page
 * @param {string} platform - Job platform name
 * @returns {Promise<boolean>} - Whether the user is logged in
 */
async function verifyLogin(page, platform) {
  try {
    const selectors = SELECTORS[platform];
    if (!selectors) {
      logger.warn(`No selectors defined for platform: ${platform}`);
      return false;
    }

    // Check for login form
    const loginForm = await page.$(selectors.username);
    if (loginForm) {
      return false;
    }

    // Platform-specific checks
    switch (platform) {
      case 'linkedin':
        return await page.$('.global-nav') !== null;
      case 'indeed':
        return await page.$('.user-account-menu') !== null;
      default:
        return false;
    }
  } catch (error) {
    logger.error(`Failed to verify login status: ${error.message}`);
    return false;
  }
}

/**
 * Performs login to a job platform
 * @param {Page} page - Playwright page
 * @param {string} platform - Job platform name
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<boolean>} - Whether login was successful
 */
async function performLogin(page, platform, email, password) {
  logger.info(`Logging in to ${platform} with ${email}`);

  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    logger.info(`Login attempt ${attempt}/${MAX_LOGIN_ATTEMPTS} for ${platform}`);

    try {
      // Navigate to login page
      await page.goto(SELECTORS[platform].loginPage, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Fill login credentials
      await withRetry(async () => {
        await page.fill(SELECTORS[platform].username, email);
        await page.fill(SELECTORS[platform].password, password);
      }, { operationName: 'Fill login credentials' });

      // Click submit
      await page.click(SELECTORS[platform].submitButton);
      await page.waitForTimeout(5000);

      // Check for security verification
      if (platform === 'linkedin') {
        try {
          const verificationInput = await page.waitForSelector(SELECTORS[platform].securityVerification, {
            timeout: 5000
          });

          if (verificationInput) {
            logger.info('Security verification required');
            // Wait for manual input
            await page.waitForSelector(SELECTORS[platform].securityVerification, {
              state: 'hidden',
              timeout: 60000
            });
            logger.info('Login verification successful');
          }
        } catch (error) {
          // No security verification needed
        }
      }

      // Verify login success
      const isLoggedIn = await verifyLogin(page, platform);
      if (isLoggedIn) {
        logger.info(`Successfully logged in to ${platform} on attempt ${attempt}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error during login attempt ${attempt}: ${error}`);
      if (attempt === MAX_LOGIN_ATTEMPTS) {
        break;
      }
      await page.waitForTimeout(5000);
    }
  }

  logger.error(`Failed to log in to ${platform} after ${MAX_LOGIN_ATTEMPTS} attempts`);
  return false;
}

// Initialize session
async function initializeSession(browser, platform, credentials) {
  try {
    // Load existing state
    const context = await browser.loadState(browser, platform);
    const page = await context.newPage();

    // Check if already logged in
    const isLoggedIn = await verifyLogin(page, platform);
    if (isLoggedIn) {
      logger.info(`Already logged in to ${platform}`);
      return { context, page };
    }

    // Attempt login
    await performLogin(page, platform, credentials.email, credentials.password);
    
    // Save new state
    await browser.saveState(context, platform);
    await browser.saveCookies(context, platform);

    return { context, page };
  } catch (error) {
    logger.error(`Failed to initialize session: ${error.message}`);
    throw error;
  }
}

module.exports = {
  saveSession,
  loadSession,
  verifyLogin,
  performLogin,
  initializeSession
}; 