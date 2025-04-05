const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const jobTracker = require('../utils/job_tracker');

class LinkedInAdapter {
  constructor(page) {
    this.page = page;
    this.selectors = {
      searchInput: '#job-search-bar-keywords',
      locationInput: '#job-search-bar-location',
      searchButton: 'button[type="submit"]',
      jobCards: '.jobs-search-results-list__list-item',
      jobTitle: '.job-card-list__title',
      companyName: '.job-card-container__company-name',
      jobLink: 'a.job-card-list__title',
      easyApplyButton: 'button.jobs-apply-button',
      applyButton: 'button[data-control-name="jobdetails_topcard_inapply"]',
      emailInput: '#email-address-input',
      phoneInput: '#phone-number-input',
      submitButton: 'button[type="submit"]',
      nextPageButton: 'button[aria-label="Next"]',
      closeButton: 'button[aria-label="Dismiss"]'
    };
  }

  /**
   * Search for jobs on LinkedIn
   * @param {string} query - Job search query
   * @param {string} location - Job location
   * @returns {Promise<boolean>} - Whether the search was successful
   */
  async searchJobs(profile) {
    try {
      // Navigate to jobs page
      await this.page.goto('https://www.linkedin.com/jobs');
      await this.page.waitForLoadState('networkidle');

      // Fill search inputs
      await this.page.fill(this.selectors.searchInput, profile.search_queries[0]);
      await this.page.fill(this.selectors.locationInput, profile.location);

      // Click search button
      await this.page.click(this.selectors.searchButton);
      await this.page.waitForLoadState('networkidle');

      // Try to apply Easy Apply filter
      try {
        const easyApplyButton = await this.page.$('button:has-text("Easy Apply")');
        if (easyApplyButton) {
          await easyApplyButton.click();
          await this.page.waitForLoadState('networkidle');
        }
      } catch (error) {
        logger.warn('Could not find Easy Apply filter button');
      }

      logger.info('Successfully searched for jobs');
      return true;
    } catch (error) {
      logger.error(`Failed to search for jobs: ${error.message}`);
      return false;
    }
  }

  /**
   * Get job listings from the current page
   * @returns {Promise<Array>} - Array of job listings
   */
  async getJobListings() {
    try {
      await this.page.waitForSelector(this.selectors.jobCards, { timeout: 10000 });
      const jobCards = await this.page.$$(this.selectors.jobCards);
      
      const jobs = [];
      for (const card of jobCards) {
        try {
          const title = await card.$(this.selectors.jobTitle);
          const company = await card.$(this.selectors.companyName);
          const link = await card.$(this.selectors.jobLink);
          
          if (title && company && link) {
            const jobData = {
              title: await title.textContent(),
              company: await company.textContent(),
              link: await link.getAttribute('href'),
              id: await link.getAttribute('data-job-id')
            };
            jobs.push(jobData);
          }
        } catch (error) {
          logger.warn(`Failed to extract job data from card: ${error.message}`);
          continue;
        }
      }
      
      return jobs;
    } catch (error) {
      logger.error(`Failed to get job listings: ${error.message}`);
      return [];
    }
  }

  /**
   * Click on a job card and apply for the job
   * @param {ElementHandle} jobCard - Job card element
   * @returns {Promise<boolean>} - Whether the application was successful
   */
  async clickApply(job) {
    try {
      // Check if already applied
      if (await this.checkIfAlreadyApplied(job)) {
        logger.info(`Already applied to job: ${job.title}`);
        return false;
      }

      // Navigate to job page
      await this.page.goto(job.link);
      await this.page.waitForLoadState('networkidle');

      // Try Easy Apply button first
      const easyApplyButton = await this.page.$(this.selectors.easyApplyButton);
      if (easyApplyButton) {
        await easyApplyButton.click();
        await this.page.waitForLoadState('networkidle');
        return true;
      }

      // Try regular apply button
      const applyButton = await this.page.$(this.selectors.applyButton);
      if (applyButton) {
        await applyButton.click();
        await this.page.waitForLoadState('networkidle');
        return true;
      }

      logger.warn(`No apply button found for job: ${job.title}`);
      return false;
    } catch (error) {
      logger.error(`Failed to click apply button: ${error.message}`);
      return false;
    }
  }

  /**
   * Fill contact information in the application form
   * @returns {Promise<boolean>} - Whether the contact information was successfully filled
   */
  async fillContactInfo(contactInfo) {
    try {
      // Fill email if field exists
      const emailInput = await this.page.$(this.selectors.emailInput);
      if (emailInput) {
        await emailInput.fill(contactInfo.email);
      }

      // Fill phone if field exists
      const phoneInput = await this.page.$(this.selectors.phoneInput);
      if (phoneInput) {
        await phoneInput.fill(contactInfo.phone);
      }

      // Click submit button
      const submitButton = await this.page.$(this.selectors.submitButton);
      if (submitButton) {
        await submitButton.click();
        await this.page.waitForLoadState('networkidle');
      }

      return true;
    } catch (error) {
      logger.error(`Failed to fill contact information: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if we've already applied to the current job
   * @returns {Promise<boolean>} - Whether we've already applied
   */
  async checkIfAlreadyApplied(job) {
    return jobTracker.hasApplied(job.id);
  }

  /**
   * Navigate to the next page of job listings
   * @returns {Promise<boolean>} - Whether navigation was successful
   */
  async navigateNextPage() {
    try {
      const nextButton = await this.page.$(this.selectors.nextPageButton);
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForLoadState('networkidle');
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to navigate to next page: ${error.message}`);
      return false;
    }
  }

  /**
   * Close any popups that might appear
   * @returns {Promise<void>}
   */
  async closePopup() {
    try {
      const closeButton = await this.page.$(this.selectors.closeButton);
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForLoadState('networkidle');
      }
    } catch (error) {
      logger.warn(`Failed to close popup: ${error.message}`);
    }
  }
}

module.exports = LinkedInAdapter; 