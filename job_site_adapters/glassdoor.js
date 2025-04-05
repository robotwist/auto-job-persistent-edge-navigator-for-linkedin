const rateLimiter = require('../utils/rateLimiter');
const logger = require('../utils/logger');

class GlassdoorAdapter {
  constructor(page) {
    this.page = page;
    this.name = 'Glassdoor';
    this.baseUrl = 'https://www.glassdoor.com';
  }

  async searchJobs(query, location) {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        const searchUrl = `${this.baseUrl}/Job/jobs.htm?sc.keyword=${encodeURIComponent(query)}&locT=C&locId=${encodeURIComponent(location)}`;
        await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
        
        // Wait for job cards to load
        await this.page.waitForSelector('.job-listing', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error searching Glassdoor jobs: ${error}`);
        return false;
      }
    });
  }

  async getJobListings() {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        return await this.page.$$('.job-listing');
      } catch (error) {
        logger.error(`Error getting Glassdoor job listings: ${error}`);
        return [];
      }
    });
  }

  async clickApply(job) {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        // Click the job card to view details
        await job.click();
        await this.page.waitForTimeout(2000);

        // Look for the apply button
        const applyButton = await this.page.$('.apply-button');
        if (!applyButton) {
          logger.info('No apply button found on Glassdoor job listing');
          return false;
        }

        await applyButton.click();
        await this.page.waitForTimeout(2000);
        return true;
      } catch (error) {
        logger.error(`Error clicking apply on Glassdoor: ${error}`);
        return false;
      }
    });
  }

  async fillContactInfo(email, phone) {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
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
        logger.error(`Error filling contact info on Glassdoor: ${error}`);
        return false;
      }
    });
  }

  async checkIfAlreadyApplied(job) {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        const appliedIndicator = await job.$('.applied-badge');
        return !!appliedIndicator;
      } catch (error) {
        logger.error(`Error checking if already applied on Glassdoor: ${error}`);
        return false;
      }
    });
  }

  async navigateNextPage(pageNumber) {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        const nextButton = await this.page.$(`.pagination__next`);
        if (!nextButton) {
          logger.info(`No next page button found for page ${pageNumber} on Glassdoor`);
          return false;
        }

        await nextButton.click();
        await this.page.waitForSelector('.job-listing', { timeout: 10000 });
        return true;
      } catch (error) {
        logger.error(`Error navigating to next page on Glassdoor: ${error}`);
        return false;
      }
    });
  }

  async closePopup() {
    return await rateLimiter.executeWithRateLimit('glassdoor', async () => {
      try {
        const closeButton = await this.page.$('.modal_closeIcon');
        if (closeButton) {
          await closeButton.click();
          await this.page.waitForTimeout(1000);
        }
        return true;
      } catch (error) {
        logger.error(`Error closing popup on Glassdoor: ${error}`);
        return false;
      }
    });
  }
}

module.exports = GlassdoorAdapter; 