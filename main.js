/**
 * Job Application Bot - Main Script
 * Designed to automate applying to jobs across multiple job boards
 */

const { chromium } = require('playwright');
const dotenv = require('dotenv');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs').promises;
const { getJobSiteAdapter } = require('./job_site_adapters');
const { answersDatabase, saveAnswer, handleNewQuestion, setJobProfile, jobProfiles } = require('./utils_Numeric.js');
const { answerBinaryQuestions, binaryAnswersDatabase } = require('./utils_Binary.js');
const { answerDropDown } = require('./utils_DropDown');
const logger = require('./utils/logger');
const withRetry = require('./utils/retry');
const { loadConfig } = require('./utils/config');
const { saveSession, loadSession, verifyLogin, performLogin, initializeSession } = require('./utils/auth');
const { applyStealth, randomDelay } = require('./utils/stealth');
const jobTracker = require('./utils/job_tracker');
const { applyFingerprint } = require('./utils/fingerprint');
const rateLimiter = require('./utils/rate_limiter');

// Load environment variables
dotenv.config();

// Import utilities
const { config } = require('./utils');

// Import job site adapters
const LinkedInAdapter = require('./job_site_adapters/linkedin');
const IndeedAdapter = require('./job_site_adapters/indeed');
const GlassdoorAdapter = require('./job_site_adapters/glassdoor');
const MonsterAdapter = require('./job_site_adapters/monster');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('platform', {
    alias: 'p',
    description: 'Specific platform to use (linkedin, indeed, glassdoor, monster)',
    type: 'string'
  })
  .option('profile', {
    alias: 'pr',
    description: 'Specific job profile to use',
    type: 'string'
  })
  .help()
  .alias('help', 'h')
  .argv;

// Map of platform names to adapter classes
const ADAPTERS = {
  linkedin: LinkedInAdapter,
  indeed: IndeedAdapter,
  glassdoor: GlassdoorAdapter,
  monster: MonsterAdapter
};

// Constants
const STATE_FILE = 'state.json';
const CONFIG_FILE = 'config.json';
const JOB_PROFILES_FILE = 'job_profiles.json';

// Save state for a specific platform
async function saveState(context, platform) {
  const statePath = `${platform}_${STATE_FILE}`;
  await withRetry(async () => {
    await context.storageState({ path: statePath });
    logger.info(`Saved state for ${platform} at ${statePath}`);
  }, { operationName: `Save state for ${platform}` });
}

// Load state for a specific platform
async function loadState(browser, platform) {
  const statePath = `${platform}_${STATE_FILE}`;
  if (fs.existsSync(statePath)) {
    logger.info(`Loading saved state for ${platform}`);
    return await withRetry(async () => {
      return await browser.newContext({ storageState: statePath });
    }, { operationName: `Load state for ${platform}` });
  } else {
    logger.info(`No saved state found for ${platform}, creating new context`);
    return await browser.newContext();
  }
}

// Get credentials for a specific platform
function getCredentials(platform) {
  const email = process.env[`${platform.toUpperCase()}_EMAIL`];
  const password = process.env[`${platform.toUpperCase()}_PASSWORD`];
  
  if (!email || !password) {
    logger.error(`Missing credentials for ${platform}. Please set ${platform.toUpperCase()}_EMAIL and ${platform.toUpperCase()}_PASSWORD in your .env file.`);
    return null;
  }
  
  return { email, password };
}

// Main job application function
async function applyToJobs(platform, jobQuery) {
  logger.info(`Starting job application process for ${platform} with query: ${jobQuery}`);
  
  const browser = await withRetry(async () => {
    return await chromium.launch({ 
      headless: config.HEADLESS === 'true',
      timeout: 60000, // Increase timeout for slow connections
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ]
    });
  }, { operationName: 'Launch browser' });
  
  try {
    // Load or create browser context with session persistence
    const context = await loadSession(browser, platform);
    const page = await context.newPage();
    
    // Apply stealth measures to avoid detection
    await applyStealth(page);
    
    // Create the appropriate adapter
    const adapter = getJobSiteAdapter(platform, page);
    if (!adapter) {
      logger.error(`Could not create adapter for ${platform}`);
      await browser.close();
      return;
    }
    
    logger.info(`Created ${adapter.name} adapter`);
    
    // Check if we're already logged in
    const isLoggedIn = await verifyLogin(page, platform);
    
    // Login if needed
    if (!isLoggedIn) {
      const credentials = getCredentials(platform);
      if (!credentials) {
        await browser.close();
        return;
      }
      
      logger.info(`Logging in to ${platform} with ${credentials.email}`);
      const loginSuccess = await performLogin(page, platform, credentials.email, credentials.password);
      
      if (!loginSuccess) {
        logger.error(`Failed to log in to ${platform}`);
        await browser.close();
        return;
      }
      
      // Save session after successful login
      await saveSession(context, platform);
    } else {
      logger.info(`Already logged in to ${platform}`);
    }
    
    // Add a random delay before searching for jobs
    await randomDelay(2000, 5000);
    
    // Search for jobs
    logger.info(`Searching for "${jobQuery}" jobs on ${platform}`);
    const searchSuccess = await withRetry(async () => {
      return await adapter.searchJobs(jobQuery, config.LOCATION);
    }, { operationName: `Search jobs on ${platform}` });
    
    if (!searchSuccess) {
      logger.error(`Failed to search for jobs on ${platform}`);
      await browser.close();
      return;
    }
    
    // Add a random delay after searching
    await randomDelay(3000, 7000);
    
    let currentPage = 1;
    let jobsApplied = 0;
    let jobsProcessed = 0;
    
    // Set job profile based on job type
    setJobProfile(config.JOB_TYPE);
    
    // Process job listings page by page
    while (currentPage <= config.MAX_PAGES && jobsApplied < config.JOBS_PER_RUN) {
      logger.info(`Processing page ${currentPage} on ${platform}`);
      
      // Get job listings
      const jobListings = await withRetry(async () => {
        return await adapter.getJobListings();
      }, { operationName: `Get job listings from ${platform}` });
      
      logger.info(`Found ${jobListings.length} job listings on page ${currentPage}`);
      
      if (jobListings.length === 0) {
        logger.info(`No job listings found on page ${currentPage}. Moving to next platform.`);
        break;
      }
      
      // Process each job listing
      for (const job of jobListings) {
        try {
          jobsProcessed++;
          
          // Add a random delay before clicking on a job
          await randomDelay(1000, 3000);
          
          // Click on the job to view details
          await withRetry(async () => {
            await job.click();
            await page.waitForTimeout(3000);
          }, { operationName: 'View job details' });
          
          // Check if already applied
          const alreadyApplied = await adapter.checkIfAlreadyApplied(job);
          if (alreadyApplied) {
            logger.info(`Already applied to this job. Skipping.`);
            continue;
          }
          
          // Add a random delay before clicking apply
          await randomDelay(2000, 4000);
          
          // Click apply button
          let applySuccess;
          if (platform === 'linkedin') {
            applySuccess = await withRetry(async () => {
              return await adapter.clickEasyApply();
            }, { operationName: 'Click Easy Apply button' });
          } else {
            applySuccess = await withRetry(async () => {
              return await adapter.clickApply(job);
            }, { operationName: 'Click Apply button' });
          }
          
          if (!applySuccess) {
            logger.error(`Failed to click apply button. Skipping job.`);
            continue;
          }
          
          // Add a random delay before filling contact info
          await randomDelay(2000, 4000);
          
          // Fill contact info
          await withRetry(async () => {
            await adapter.fillContactInfo(
              process.env.EMAIL || 'your@email.com',
              process.env.PHONE_NUMBER || '123-456-7890'
            );
          }, { operationName: 'Fill contact information' });
          
          // Answer questions
          await answerQuestions(page);
          
          // Handle navigation through application steps
          let applicationCompleted = false;
          let attemptCount = 0;
          
          while (!applicationCompleted && attemptCount < 15) {
            attemptCount++;
            
            // Add a random delay before clicking next
            await randomDelay(1500, 3500);
            
            // Click next button
            const nextClicked = await withRetry(async () => {
              return await adapter.clickNextButton();
            }, { operationName: 'Click Next button' });
            
            if (!nextClicked) {
              logger.info(`No next button found after ${attemptCount} attempts. Application may be complete.`);
              applicationCompleted = true;
              continue;
            }
            
            await page.waitForTimeout(3000);
            
            // Answer questions on each page
            await answerQuestions(page);
          }
          
          // Add a random delay before closing popup
          await randomDelay(1000, 3000);
          
          // Close confirmation popup if exists
          if (platform === 'linkedin') {
            await withRetry(async () => {
              await adapter.closePopup();
            }, { operationName: 'Close confirmation popup' });
          }
          
          jobsApplied++;
          logger.info(`Successfully applied to job ${jobsApplied} (processed ${jobsProcessed})`);
          
          // Add a longer random delay after applying to a job
          await randomDelay(5000, 10000);
          
          if (jobsApplied >= config.JOBS_PER_RUN) {
            logger.info(`Reached maximum number of applications (${config.JOBS_PER_RUN}). Stopping.`);
            break;
          }
        } catch (error) {
          logger.error(`Error processing job: ${error}`);
          continue;
        }
      }
      
      // Navigate to next page if needed
      if (jobsApplied < config.JOBS_PER_RUN && currentPage < config.MAX_PAGES) {
        // Add a random delay before navigating to next page
        await randomDelay(3000, 6000);
        
        const nextPageSuccess = await withRetry(async () => {
          return await adapter.navigateNextPage(currentPage + 1);
        }, { operationName: `Navigate to page ${currentPage + 1}` });
        
        if (!nextPageSuccess) {
          logger.error(`Failed to navigate to page ${currentPage + 1}. Stopping.`);
          break;
        }
        
        currentPage++;
      }
    }
    
    await browser.close();
    logger.info(`Completed job application process for ${platform}`);
  } catch (error) {
    logger.error(`Error in job application process: ${error}`);
    await browser.close();
  }
}

// Answer questions on the current page
async function answerQuestions(page) {
  try {
    // Handle numeric questions
    await handleNewQuestion(page);
    
    // Handle binary questions
    await answerBinaryQuestions(page);
    
    // Handle dropdown questions
    await answerDropDown(page);
  } catch (error) {
    logger.error(`Error answering questions: ${error}`);
  }
}

// Main function
async function main() {
  let browser;
  let context;
  let page;

  try {
    // Load configuration
    const jobProfiles = await config.loadJobProfiles();
    const envConfig = await config.loadEnvConfig();
    
    logger.info('Starting job application process');
    
    // Launch browser
    browser = await chromium.launch({
      headless: envConfig.HEADLESS === 'true'
    });

    // Create context with fingerprint
    context = await browser.newContext();
    await applyFingerprint(context);
    
    // Create page with stealth measures
    page = await context.newPage();
    await applyStealth(page);

    // Initialize LinkedIn session
    await initializeSession(browser, 'linkedin', {
      email: envConfig.LINKEDIN_EMAIL,
      password: envConfig.LINKEDIN_PASSWORD
    });

    // Load applied jobs history
    await jobTracker.loadAppliedJobs();

    // Create LinkedIn adapter
    const linkedinAdapter = new LinkedInAdapter(page);

    // Process each job profile
    for (const profile of jobProfiles) {
      logger.info(`Processing job profile: ${profile.title}`);
      
      // Wait for rate limit
      await rateLimiter.waitForSlot('linkedin');
      
      // Search for jobs
      await linkedinAdapter.searchJobs(profile);
      
      // Get job listings
      const jobs = await linkedinAdapter.getJobListings();
      logger.info(`Found ${jobs.length} jobs matching criteria`);

      // Process each job
      for (const job of jobs) {
        try {
          // Check if already applied
          if (await linkedinAdapter.checkIfAlreadyApplied(job)) {
            logger.info(`Already applied to job: ${job.title}`);
            continue;
          }

          // Wait for rate limit
          await rateLimiter.waitForSlot('linkedin');

          // Click apply button
          const applied = await linkedinAdapter.clickApply(job);
          if (!applied) {
            logger.warn(`Failed to apply to job: ${job.title}`);
            continue;
          }

          // Fill contact information
          await linkedinAdapter.fillContactInfo({
            email: envConfig.EMAIL,
            phone: envConfig.PHONE_NUMBER
          });

          // Mark job as applied
          await jobTracker.markAsApplied(job.id);

          logger.info(`Successfully applied to job: ${job.title}`);
        } catch (error) {
          logger.error(`Error processing job ${job.title}: ${error.message}`);
          continue;
        }
      }
    }

    logger.info('Job application process completed');
  } catch (error) {
    logger.error(`Application process failed: ${error.message}`);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

/**
 * Load job profiles from job_profiles.json
 * @returns {Promise<Object>} - Job profiles
 */
async function loadJobProfiles() {
  try {
    const profilesPath = path.join(process.cwd(), 'job_profiles.json');
    const profilesData = await fs.readFile(profilesPath, 'utf8');
    return JSON.parse(profilesData);
  } catch (error) {
    logger.error(`Error loading job profiles: ${error}`);
    return { profiles: {} };
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
}); 