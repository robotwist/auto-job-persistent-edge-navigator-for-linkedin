const rateLimiter = require('../utils/rateLimiter');
const logger = require('../utils/logger');

class MonsterAdapter {
  constructor(page) {
    this.page = page;
    this.name = 'Monster';
    this.baseUrl = 'https://www.monster.com';
  }

  async searchJobs(query, location) {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        const searchUrl = `${this.baseUrl}/jobs/search/?q=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}`;
        await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
        
        // Wait for job cards to load
        await this.page.waitForSelector('.job-search-card', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error searching Monster jobs: ${error}`);
        return false;
      }
    });
  }

  async getJobListings() {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        return await this.page.$$('.job-search-card');
      } catch (error) {
        logger.error(`Error getting Monster job listings: ${error}`);
        return [];
      }
    });
  }

  async clickApply(job) {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        // Click the job card to view details
        await job.click();
        await this.page.waitForTimeout(2000);

        // Look for the apply button
        const applyButton = await this.page.$('.job-apply-button');
        if (!applyButton) {
          logger.info('No apply button found on Monster job listing');
          return false;
        }

        await applyButton.click();
        await this.page.waitForTimeout(2000);
        return true;
      } catch (error) {
        logger.error(`Error clicking apply on Monster: ${error}`);
        return false;
      }
    });
  }

  async fillContactInfo(email, phone) {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        // Wait for the application form to load
        await this.page.waitForSelector('.application-form', { timeout: 10000 });

        // Fill email if field exists
        const emailField = await this.page.$('input[type="email"]');
        if (emailField) {
          await emailField.fill(email);
        }

        // Fill phone if field exists
        const phoneField = await this.page.$('input[type="tel"]');
        if (phoneField) {
          await phoneField.fill(phone);
        }

        return true;
      } catch (error) {
        logger.error(`Error filling contact info on Monster: ${error}`);
        return false;
      }
    });
  }

  async checkIfAlreadyApplied(job) {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        const appliedIndicator = await job.$('.applied-status');
        return !!appliedIndicator;
      } catch (error) {
        logger.error(`Error checking if already applied on Monster: ${error}`);
        return false;
      }
    });
  }

  async navigateNextPage(pageNumber) {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        const nextButton = await this.page.$(`.pagination-next`);
        if (!nextButton) {
          logger.info(`No next page button found for page ${pageNumber} on Monster`);
          return false;
        }

        await nextButton.click();
        await this.page.waitForSelector('.job-search-card', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error navigating to next page on Monster: ${error}`);
        return false;
      }
    });
  }

  async closePopup() {
    return await rateLimiter.executeWithRateLimit('monster', async () => {
      try {
        const closeButton = await this.page.$('.modal-close-button');
        if (closeButton) {
          await closeButton.click();
          await this.page.waitForTimeout(1000);
        }
        return true;
      } catch (error) {
        logger.error(`Error closing popup on Monster: ${error}`);
        return false;
      }
    });
  }
}

module.exports = MonsterAdapter; 