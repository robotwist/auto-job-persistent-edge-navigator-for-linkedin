const rateLimiter = require('../utils/rateLimiter');
const logger = require('../utils/logger');

class IndeedAdapter {
  constructor(page) {
    this.page = page;
    this.name = 'Indeed';
    this.baseUrl = 'https://www.indeed.com';
  }

  async searchJobs(query, location) {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        const searchUrl = `${this.baseUrl}/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;
        await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
        
        // Wait for job cards to load
        await this.page.waitForSelector('.job_seen_beacon', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error searching Indeed jobs: ${error}`);
        return false;
      }
    });
  }

  async getJobListings() {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        return await this.page.$$('.job_seen_beacon');
      } catch (error) {
        logger.error(`Error getting Indeed job listings: ${error}`);
        return [];
      }
    });
  }

  async clickApply(job) {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        // Click the job card to view details
        await job.click();
        await this.page.waitForTimeout(2000);

        // Look for the apply button
        const applyButton = await this.page.$('button[data-testid="apply-button"]');
        if (!applyButton) {
          logger.info('No apply button found on Indeed job listing');
          return false;
        }

        await applyButton.click();
        await this.page.waitForTimeout(2000);
        return true;
      } catch (error) {
        logger.error(`Error clicking apply on Indeed: ${error}`);
        return false;
      }
    });
  }

  async fillContactInfo(email, phone) {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        // Wait for the application form to load
        await this.page.waitForSelector('form[data-testid="application-form"]', { timeout: 10000 });

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
        logger.error(`Error filling contact info on Indeed: ${error}`);
        return false;
      }
    });
  }

  async checkIfAlreadyApplied(job) {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        const appliedIndicator = await job.$('.applied-indicator');
        return !!appliedIndicator;
      } catch (error) {
        logger.error(`Error checking if already applied on Indeed: ${error}`);
        return false;
      }
    });
  }

  async navigateNextPage(pageNumber) {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        const nextButton = await this.page.$(`a[aria-label="Page ${pageNumber}"]`);
        if (!nextButton) {
          logger.info(`No next page button found for page ${pageNumber} on Indeed`);
          return false;
        }

        await nextButton.click();
        await this.page.waitForSelector('.job_seen_beacon', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error navigating to next page on Indeed: ${error}`);
        return false;
      }
    });
  }

  async closePopup() {
    return await rateLimiter.executeWithRateLimit('indeed', async () => {
      try {
        const closeButton = await this.page.$('button[aria-label="Close"]');
        if (closeButton) {
          await closeButton.click();
          await this.page.waitForTimeout(1000);
        }
        return true;
      } catch (error) {
        logger.error(`Error closing popup on Indeed: ${error}`);
        return false;
      }
    });
  }
}

module.exports = IndeedAdapter; 