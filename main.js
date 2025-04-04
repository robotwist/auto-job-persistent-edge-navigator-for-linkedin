/**
 * Job Application Bot - Main Script
 * Designed to automate applying to jobs across multiple job boards
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { getJobSiteAdapter } = require('./job_site_adapters');
const { answersDatabase, saveAnswer, handleNewQuestion, setJobProfile, jobProfiles } = require('./utils_Numeric.js');
const { answerBinaryQuestions, binaryAnswersDatabase } = require('./utils_Binary.js');
const { answerDropDown } = require('./utils_DropDown');

// Load environment variables
dotenv.config();

// Configuration
const STATE_FILE = 'state.json';
const CONFIG_FILE = 'config.json';
const JOB_PROFILES_FILE = 'job_profiles.json';
const LOG_DIR = 'logs';
const LOG_FILE = `${LOG_DIR}/application_log_${new Date().toISOString().split('T')[0]}.log`;

// Create log directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// Setup logging
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  console.log(logMessage);
  
  // Also write to log file
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
};

// Load configuration
let config = {
  jobSearchQueries: ['Junior Software Engineer', 'QA Engineer', 'Technical Support'],
  currentJobType: 'junior_developer',
  maxPages: 5,
  jobsPerRun: 20,
  activePlatforms: ['linkedin'], // 'linkedin', 'indeed', 'ziprecruiter'
  location: '',
  headless: false
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(configData) };
    log(`Configuration loaded from ${CONFIG_FILE}`);
  } catch (error) {
    log(`Error loading config file: ${error}`, 'error');
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  log(`Created new config file with default settings at ${CONFIG_FILE}`);
}

// Save state for a specific platform
async function saveState(context, platform) {
  const statePath = `${platform}_${STATE_FILE}`;
  await context.storageState({ path: statePath });
  log(`Saved state for ${platform} at ${statePath}`);
}

// Load state for a specific platform
async function loadState(browser, platform) {
  const statePath = `${platform}_${STATE_FILE}`;
  if (fs.existsSync(statePath)) {
    log(`Loading saved state for ${platform}`);
    return await browser.newContext({ storageState: statePath });
  } else {
    log(`No saved state found for ${platform}, creating new context`);
    return await browser.newContext();
  }
}

// Get credentials for a specific platform
function getCredentials(platform) {
  const email = process.env[`${platform.toUpperCase()}_EMAIL`];
  const password = process.env[`${platform.toUpperCase()}_PASSWORD`];
  
  if (!email || !password) {
    log(`Missing credentials for ${platform}. Please set ${platform.toUpperCase()}_EMAIL and ${platform.toUpperCase()}_PASSWORD in your .env file.`, 'error');
    return null;
  }
  
  return { email, password };
}

// Main job application function
async function applyToJobs(platform, jobQuery) {
  log(`Starting job application process for ${platform} with query: ${jobQuery}`);
  
  const browser = await chromium.launch({ 
    headless: config.headless,
    timeout: 60000 // Increase timeout for slow connections
  });
  
  try {
    const context = await loadState(browser, platform);
    const page = await context.newPage();
    
    // Create the appropriate adapter
    const adapter = getJobSiteAdapter(platform, page);
    if (!adapter) {
      log(`Could not create adapter for ${platform}`, 'error');
      await browser.close();
      return;
    }
    
    log(`Created ${adapter.name} adapter`);
    
    // Login if needed
    if (!fs.existsSync(`${platform}_${STATE_FILE}`)) {
      const credentials = getCredentials(platform);
      if (!credentials) {
        await browser.close();
        return;
      }
      
      log(`Logging in to ${platform} with ${credentials.email}`);
      const loginSuccess = await adapter.login(credentials.email, credentials.password);
      
      if (!loginSuccess) {
        log(`Failed to log in to ${platform}`, 'error');
        await browser.close();
        return;
      }
      
      await saveState(context, platform);
    }
    
    // Search for jobs
    log(`Searching for "${jobQuery}" jobs on ${platform}`);
    const searchSuccess = await adapter.searchJobs(jobQuery, config.location);
    
    if (!searchSuccess) {
      log(`Failed to search for jobs on ${platform}`, 'error');
      await browser.close();
      return;
    }
    
    let currentPage = 1;
    let jobsApplied = 0;
    let jobsProcessed = 0;
    
    // Set job profile based on job type
    setJobProfile(config.currentJobType);
    
    // Process job listings page by page
    while (currentPage <= config.maxPages && jobsApplied < config.jobsPerRun) {
      log(`Processing page ${currentPage} on ${platform}`);
      
      // Get job listings
      const jobListings = await adapter.getJobListings();
      log(`Found ${jobListings.length} job listings on page ${currentPage}`);
      
      if (jobListings.length === 0) {
        log(`No job listings found on page ${currentPage}. Moving to next platform.`);
        break;
      }
      
      // Process each job listing
      for (const job of jobListings) {
        try {
          jobsProcessed++;
          
          // Click on the job to view details
          await job.click();
          await page.waitForTimeout(3000);
          
          // Check if already applied
          const alreadyApplied = await adapter.checkIfAlreadyApplied(job);
          if (alreadyApplied) {
            log(`Already applied to this job. Skipping.`);
            continue;
          }
          
          // Click apply button
          let applySuccess;
          if (platform === 'linkedin') {
            applySuccess = await adapter.clickEasyApply();
          } else {
            applySuccess = await adapter.clickApply(job);
          }
          
          if (!applySuccess) {
            log(`Failed to click apply button. Skipping job.`);
            continue;
          }
          
          // Fill contact info
          await adapter.fillContactInfo(
            process.env.EMAIL || 'your@email.com',
            process.env.PHONE_NUMBER || '123-456-7890'
          );
          
          // Answer questions
          await answerQuestions(page);
          
          // Handle navigation through application steps
          let applicationCompleted = false;
          let attemptCount = 0;
          
          while (!applicationCompleted && attemptCount < 15) {
            attemptCount++;
            
            // Click next button
            const nextClicked = await adapter.clickNextButton();
            if (!nextClicked) {
              log(`No next button found after ${attemptCount} attempts. Application may be complete.`);
              applicationCompleted = true;
              continue;
            }
            
            await page.waitForTimeout(3000);
            
            // Answer questions on each page
            await answerQuestions(page);
          }
          
          // Close confirmation popup if exists
          if (platform === 'linkedin') {
            await adapter.closePopup();
          }
          
          jobsApplied++;
          log(`Successfully applied to job ${jobsApplied} (processed ${jobsProcessed})`);
          
          if (jobsApplied >= config.jobsPerRun) {
            log(`Reached maximum number of applications (${config.jobsPerRun}). Stopping.`);
            break;
          }
        } catch (error) {
          log(`Error processing job: ${error}`, 'error');
          continue;
        }
      }
      
      // Navigate to next page if needed
      if (jobsApplied < config.jobsPerRun && currentPage < config.maxPages) {
        const nextPageSuccess = await adapter.navigateNextPage(currentPage + 1);
        if (!nextPageSuccess) {
          log(`No more pages available on ${platform}`);
          break;
        }
        currentPage++;
      } else {
        break;
      }
    }
    
    log(`Completed job application process on ${platform}. Applied to ${jobsApplied} jobs.`);
  } catch (error) {
    log(`Error in job application process: ${error}`, 'error');
  } finally {
    await browser.close();
  }
}

// Answer all types of questions
async function answerQuestions(page) {
  try {
    await answerNumericQuestions(page);
    await answerBinaryQuestions(page);
    await answerDropDown(page);
  } catch (error) {
    log(`Error answering questions: ${error}`, 'error');
  }
}

// Answer numeric questions
async function answerNumericQuestions(page) {
  try {
    const questionSelectors = [
      'label.artdeco-text-input--label',
      'label[for^="text-entity"]',
      'label.fb-form-element-label'
    ];
    
    for (const selector of questionSelectors) {
      const questionElements = await page.$$(selector);
      
      for (const questionElement of questionElements) {
        try {
          const questionText = await questionElement.textContent();
          log(`Numeric Question: ${questionText}`);
          
          const inputId = await questionElement.getAttribute('for');
          const answerElement = await page.$(`#${inputId}`);
          
          if (!answerElement) {
            log(`Input element not found for question: "${questionText}"`);
            continue;
          }
          
          // Check if this is a years of experience question with a specific match
          if (/years? of experience/i.test(questionText)) {
            const answer = jobProfiles[config.currentJobType]?.yearsOfExperience?.default || '1';
            await answerElement.fill(answer);
            log(`Answered "${questionText}" with "${answer}"`);
            continue;
          }
          
          // Look for existing answer in database
          let answer = answersDatabase[questionText.trim()];
          
          // If no answer found, try to generate one
          if (!answer) {
            answer = await handleNewQuestion(questionText.trim());
          }
          
          if (answer !== null) {
            await answerElement.fill(answer);
            log(`Answered "${questionText}" with "${answer}"`);
          }
        } catch (error) {
          log(`Error processing numeric question: ${error}`, 'error');
        }
      }
    }
  } catch (error) {
    log(`Error in answerNumericQuestions: ${error}`, 'error');
  }
}

// Main function
async function main() {
  log('Starting job application bot');
  
  // Check if job profiles file exists
  if (!fs.existsSync(JOB_PROFILES_FILE)) {
    log(`Job profiles file ${JOB_PROFILES_FILE} not found!`, 'error');
    return;
  }
  
  // Process each platform
  for (const platform of config.activePlatforms) {
    // Process each job query for the current job type
    const jobProfile = jobProfiles[config.currentJobType];
    
    if (!jobProfile) {
      log(`Job profile ${config.currentJobType} not found!`, 'error');
      continue;
    }
    
    for (const jobQuery of jobProfile.searchQueries) {
      await applyToJobs(platform, jobQuery);
    }
  }
  
  log('Job application process completed');
}

// Run the main function
main().catch(error => {
  log(`Unhandled error in main function: ${error}`, 'error');
}); 