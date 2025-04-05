const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const STATE_DIR = path.join(process.cwd(), 'browser_state');
const COOKIES_DIR = path.join(process.cwd(), 'cookies');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.mkdir(COOKIES_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create directories: ${error.message}`);
    throw error;
  }
}

// Save browser state
async function saveState(context, platform) {
  try {
    await ensureDirectories();
    const statePath = path.join(STATE_DIR, `${platform}_state.json`);
    const state = await context.storageState();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    logger.info(`Saved browser state for ${platform}`);
  } catch (error) {
    logger.error(`Failed to save browser state: ${error.message}`);
    throw error;
  }
}

// Load browser state
async function loadState(browser, platform) {
  try {
    await ensureDirectories();
    const statePath = path.join(STATE_DIR, `${platform}_state.json`);
    
    try {
      const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
      const context = await browser.newContext({ storageState: state });
      logger.info(`Loaded browser state for ${platform}`);
      return context;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(`No saved state found for ${platform}, creating new context`);
        return await browser.newContext();
      }
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to load browser state: ${error.message}`);
    throw error;
  }
}

// Save cookies
async function saveCookies(context, platform) {
  try {
    await ensureDirectories();
    const cookiesPath = path.join(COOKIES_DIR, `${platform}_cookies.json`);
    const cookies = await context.cookies();
    await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
    logger.info(`Saved cookies for ${platform}`);
  } catch (error) {
    logger.error(`Failed to save cookies: ${error.message}`);
    throw error;
  }
}

// Load cookies
async function loadCookies(context, platform) {
  try {
    await ensureDirectories();
    const cookiesPath = path.join(COOKIES_DIR, `${platform}_cookies.json`);
    
    try {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf8'));
      await context.addCookies(cookies);
      logger.info(`Loaded cookies for ${platform}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(`No saved cookies found for ${platform}`);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error(`Failed to load cookies: ${error.message}`);
    throw error;
  }
}

// Clear browser state and cookies
async function clearState(platform) {
  try {
    await ensureDirectories();
    const statePath = path.join(STATE_DIR, `${platform}_state.json`);
    const cookiesPath = path.join(COOKIES_DIR, `${platform}_cookies.json`);
    
    await fs.unlink(statePath).catch(() => {});
    await fs.unlink(cookiesPath).catch(() => {});
    logger.info(`Cleared browser state and cookies for ${platform}`);
  } catch (error) {
    logger.error(`Failed to clear browser state: ${error.message}`);
    throw error;
  }
}

module.exports = {
  saveState,
  loadState,
  saveCookies,
  loadCookies,
  clearState
}; 