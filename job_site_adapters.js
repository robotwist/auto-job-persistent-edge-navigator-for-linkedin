/**
 * Adapters for different job sites
 * This module provides the necessary abstraction layer to support multiple job sites
 */

const fs = require('fs');
const path = require('path');

// Base adapter class with common functionality
class JobSiteAdapter {
  constructor(page) {
    this.page = page;
    this.name = 'Generic';
  }

  async login(email, password) {
    throw new Error('Method not implemented. Each adapter must implement login.');
  }

  async searchJobs(query, location = '') {
    throw new Error('Method not implemented. Each adapter must implement searchJobs.');
  }

  async applyToJob() {
    throw new Error('Method not implemented. Each adapter must implement applyToJob.');
  }

  async answerQuestions() {
    throw new Error('Method not implemented. Each adapter must implement answerQuestions.');
  }

  async navigateNextPage() {
    throw new Error('Method not implemented. Each adapter must implement navigateNextPage.');
  }
}

// LinkedIn Adapter
class LinkedInAdapter extends JobSiteAdapter {
  constructor(page) {
    super(page);
    this.name = 'LinkedIn';
  }

  async login(email, password) {
    await this.page.goto('https://www.linkedin.com/login');
    
    await this.page.fill('input[name="session_key"]', email);
    await this.page.fill('input[name="session_password"]', password);
    await this.page.click('button[type="submit"]');
    
    try {
      await this.page.waitForSelector('a.global-nav__primary-link--active', { timeout: 30000 });
      console.log('LinkedIn login successful');
      return true;
    } catch (error) {
      console.error('LinkedIn login failed:', error);
      return false;
    }
  }

  async searchJobs(query, location = '') {
    await this.page.goto('https://www.linkedin.com/jobs/');
    
    await this.page.waitForTimeout(3000);
    
    // Click on search box
    await this.page.getByRole('combobox', { name: 'Search by title, skill, or' }).click();
    await this.page.waitForTimeout(2000);

    // Fill job title
    await this.page.getByRole('combobox', { name: 'Search by title, skill, or' }).fill(query);
    await this.page.getByRole('combobox', { name: 'Search by title, skill, or' }).press('Enter');
    await this.page.waitForTimeout(5000);

    // Apply Easy Apply filter
    try {
      await this.page.waitForSelector("//button[@aria-label='Easy Apply filter.']", { timeout: 10000 });
      await this.page.click("//button[@aria-label='Easy Apply filter.']");
      console.log("LinkedIn Easy Apply filter applied");
      await this.page.waitForTimeout(3000);
      return true;
    } catch (error) {
      console.error('Failed to apply Easy Apply filter:', error);
      return false;
    }
  }

  async getJobListings() {
    const jobListings = await this.page.$$('//div[contains(@class,"display-flex job-card-container")]');
    console.log(`Found ${jobListings.length} LinkedIn job listings`);
    return jobListings;
  }

  async checkIfAlreadyApplied() {
    const alreadyApplied = await this.page.$('span.artdeco-inline-feedback__message:has-text("Applied")');
    return !!alreadyApplied;
  }

  async clickEasyApply() {
    try {
      const easyApplyButton = await this.page.waitForSelector('button.jobs-apply-button', { timeout: 5000 });
      await easyApplyButton.click();
      await this.page.waitForTimeout(3000);
      return true;
    } catch (error) {
      console.log('No LinkedIn Easy Apply button found or failed to click.');
      return false;
    }
  }

  async fillContactInfo(email, phoneNumber) {
    // Fill email
    const emailLabel = await this.page.$('label:has-text("Email address")') || await this.page.$('label:has-text("Email")');
    if (emailLabel) {
      const emailInputId = await emailLabel.getAttribute('for');
      await this.page.selectOption(`#${emailInputId}`, email);
    }

    // Fill phone country code
    try {
      const phoneCountryLabel = await this.page.$('label:has-text("Phone country code")');
      if (phoneCountryLabel) {
        const phoneCountryInputId = await phoneCountryLabel.getAttribute('for');
        await this.page.selectOption(`#${phoneCountryInputId}`, 'United States (+1)');
      }
    } catch (error) {
      console.log('Phone country code dropdown not found:', error.message);
    }

    // Fill phone number
    try {
      const phoneLabels = ['Mobile phone number', 'Phone'];
      
      for (const label of phoneLabels) {
        try {
          const inputElement = await this.page.getByLabel(label, { exact: true });
          await inputElement.fill(phoneNumber);
          console.log(`Filled ${label} with ${phoneNumber}`);
          break;
        } catch (error) {
          console.log(`${label} input field not found.`);
        }
      }
    } catch (error) {
      console.error("Error filling phone number:", error);
    }
  }

  async clickNextButton() {
    const buttonLabels = [
      'Continue to next step',
      'Submit application',
      'Review',
      'Next',
      'Done',
      'Save'
    ];

    for (const label of buttonLabels) {
      try {
        const button = await this.page.$(`button[aria-label="${label}"]`);
        if (button) {
          await button.click();
          console.log(`Clicked LinkedIn ${label} button`);
          return true;
        }
      } catch (error) {
        console.error(`Error clicking LinkedIn ${label} button:`, error);
      }
    }
    
    console.log("No suitable LinkedIn button found to progress the application");
    return false;
  }

  async navigateNextPage(currentPage) {
    const nextPageButton = await this.page.$(`button[aria-label="Page ${currentPage}"]`);
    if (nextPageButton) {
      await nextPageButton.click();
      await this.page.waitForTimeout(5000);
      console.log(`Navigated to LinkedIn page ${currentPage}`);
      return true;
    } else {
      console.log(`No more LinkedIn pages found.`);
      return false;
    }
  }

  async closePopup() {
    try {
      const popupCloseButton = await this.page.$('button[aria-label="Dismiss"]') || 
                               await this.page.$('button[aria-label="Done"]') || 
                               await this.page.$('button[aria-label="Continue applying"]');
      if (popupCloseButton) {
        await popupCloseButton.click();
        console.log("LinkedIn popup closed successfully");
        return true;
      } else {
        console.log("No LinkedIn popup close button found");
        return false;
      }
    } catch (error) {
      console.error("Error closing LinkedIn popup:", error);
      return false;
    }
  }
}

// Indeed Adapter
class IndeedAdapter extends JobSiteAdapter {
  constructor(page) {
    super(page);
    this.name = 'Indeed';
  }

  async login(email, password) {
    await this.page.goto('https://secure.indeed.com/auth');
    
    // Click Email login option if available
    try {
      const emailButton = await this.page.$('button:has-text("Continue with email")');
      if (emailButton) {
        await emailButton.click();
        await this.page.waitForTimeout(2000);
      }
    } catch (error) {
      console.log('Already on email login screen');
    }
    
    // Fill email
    try {
      await this.page.fill('input[type="email"]', email);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(2000);
    } catch (error) {
      console.error('Error entering email on Indeed:', error);
      return false;
    }
    
    // Fill password
    try {
      await this.page.fill('input[type="password"]', password);
      await this.page.click('button[type="submit"]');
      
      // Wait for login to complete
      await this.page.waitForSelector('a[data-gnav-element-name="JobSearch"]', { timeout: 30000 });
      console.log('Indeed login successful');
      return true;
    } catch (error) {
      console.error('Indeed login failed:', error);
      return false;
    }
  }

  async searchJobs(query, location = '') {
    await this.page.goto('https://www.indeed.com/');
    
    // Fill "what" field
    await this.page.fill('input[id="text-input-what"]', query);
    
    // Fill "where" field if provided
    if (location) {
      await this.page.fill('input[id="text-input-where"]', location);
    }
    
    // Click search button
    await this.page.click('button[type="submit"]');
    await this.page.waitForTimeout(5000);
    
    // Apply "Easy Apply" filter if available
    try {
      await this.page.click('button:has-text("Easy Apply")');
      console.log("Indeed Easy Apply filter applied");
      await this.page.waitForTimeout(3000);
      return true;
    } catch (error) {
      console.log('Failed to apply Indeed Easy Apply filter. Continuing without filter.');
      return true;
    }
  }

  async getJobListings() {
    const jobListings = await this.page.$$('.job_seen_beacon');
    console.log(`Found ${jobListings.length} Indeed job listings`);
    return jobListings;
  }

  async checkIfAlreadyApplied(jobCard) {
    const appliedText = await jobCard.$('.applied-snippet');
    return !!appliedText;
  }

  async clickApply(jobCard) {
    try {
      await jobCard.click();
      await this.page.waitForTimeout(3000);
      
      // Look for "Apply now" button
      const applyButton = await this.page.$('button:has-text("Apply now")');
      if (applyButton) {
        await applyButton.click();
        await this.page.waitForTimeout(3000);
        return true;
      } else {
        console.log('No Indeed Apply button found');
        return false;
      }
    } catch (error) {
      console.error('Error clicking Indeed Apply button:', error);
      return false;
    }
  }

  async fillContactInfo(email, phoneNumber) {
    // Fill email if needed
    try {
      const emailInput = await this.page.$('input[type="email"]');
      if (emailInput) {
        await emailInput.fill(email);
      }
    } catch (error) {
      console.log('No email field found on Indeed application form');
    }
    
    // Fill phone if needed
    try {
      const phoneInput = await this.page.$('input[type="tel"]');
      if (phoneInput) {
        await phoneInput.fill(phoneNumber);
      }
    } catch (error) {
      console.log('No phone field found on Indeed application form');
    }
  }

  async clickNextButton() {
    const buttonTexts = ['Continue', 'Next', 'Submit', 'Apply'];
    
    for (const text of buttonTexts) {
      try {
        const button = await this.page.$(`button:has-text("${text}")`);
        if (button) {
          await button.click();
          console.log(`Clicked Indeed ${text} button`);
          await this.page.waitForTimeout(2000);
          return true;
        }
      } catch (error) {
        console.log(`No Indeed ${text} button found`);
      }
    }
    
    return false;
  }

  async navigateNextPage() {
    try {
      const nextButton = await this.page.$('a[data-testid="pagination-page-next"]');
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForTimeout(3000);
        console.log('Navigated to next Indeed page');
        return true;
      } else {
        console.log('No more Indeed pages');
        return false;
      }
    } catch (error) {
      console.error('Error navigating to next Indeed page:', error);
      return false;
    }
  }
}

// ZipRecruiter Adapter
class ZipRecruiterAdapter extends JobSiteAdapter {
  constructor(page) {
    super(page);
    this.name = 'ZipRecruiter';
  }

  async login(email, password) {
    await this.page.goto('https://www.ziprecruiter.com/login');
    
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
    
    try {
      // Wait for either the job search page or dashboard
      await this.page.waitForSelector('.dashboard-header, .job-search', { timeout: 30000 });
      console.log('ZipRecruiter login successful');
      return true;
    } catch (error) {
      console.error('ZipRecruiter login failed:', error);
      return false;
    }
  }

  async searchJobs(query, location = '') {
    await this.page.goto('https://www.ziprecruiter.com/candidate/search');
    
    // Fill search fields
    await this.page.fill('input[name="search"]', query);
    if (location) {
      await this.page.fill('input[name="location"]', location);
    }
    
    // Submit search
    await this.page.press('input[name="search"]', 'Enter');
    await this.page.waitForTimeout(5000);
    
    // Look for "Quick Apply" option
    try {
      const quickApplyCheckbox = await this.page.$('input[type="checkbox"][name="quick_apply"]');
      if (quickApplyCheckbox) {
        await quickApplyCheckbox.click();
        await this.page.waitForTimeout(3000);
      }
      return true;
    } catch (error) {
      console.log('No Quick Apply filter on ZipRecruiter');
      return true;
    }
  }

  async getJobListings() {
    const jobListings = await this.page.$$('.job_content');
    console.log(`Found ${jobListings.length} ZipRecruiter job listings`);
    return jobListings;
  }

  async checkIfAlreadyApplied(jobCard) {
    const appliedText = await jobCard.$('text="Applied"');
    return !!appliedText;
  }

  async clickApply(jobCard) {
    try {
      await jobCard.click();
      await this.page.waitForTimeout(2000);
      
      const applyButton = await this.page.$('button:has-text("Quick Apply"), button:has-text("Apply Now")');
      if (applyButton) {
        await applyButton.click();
        await this.page.waitForTimeout(3000);
        return true;
      } else {
        console.log('No ZipRecruiter apply button found');
        return false;
      }
    } catch (error) {
      console.error('Error clicking ZipRecruiter apply button:', error);
      return false;
    }
  }

  async fillContactInfo(email, phoneNumber) {
    // Fill in contact info if needed
    const emailInput = await this.page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.fill(email);
    }
    
    const phoneInput = await this.page.$('input[type="tel"]');
    if (phoneInput) {
      await phoneInput.fill(phoneNumber);
    }
  }

  async clickNextButton() {
    const buttonTexts = ['Submit', 'Apply', 'Continue', 'Next'];
    
    for (const text of buttonTexts) {
      try {
        const button = await this.page.$(`button:has-text("${text}")`);
        if (button) {
          await button.click();
          console.log(`Clicked ZipRecruiter ${text} button`);
          await this.page.waitForTimeout(2000);
          return true;
        }
      } catch (error) {
        console.log(`No ZipRecruiter ${text} button found`);
      }
    }
    
    return false;
  }

  async navigateNextPage() {
    try {
      const nextButton = await this.page.$('a:has-text("Next")');
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForTimeout(3000);
        console.log('Navigated to next ZipRecruiter page');
        return true;
      } else {
        console.log('No more ZipRecruiter pages');
        return false;
      }
    } catch (error) {
      console.error('Error navigating to next ZipRecruiter page:', error);
      return false;
    }
  }
}

// Factory function to create appropriate adapter
function getJobSiteAdapter(site, page) {
  switch (site.toLowerCase()) {
    case 'linkedin':
      return new LinkedInAdapter(page);
    case 'indeed':
      return new IndeedAdapter(page);
    case 'ziprecruiter':
      return new ZipRecruiterAdapter(page);
    default:
      console.error(`Unsupported job site: ${site}`);
      return null;
  }
}

module.exports = {
  getJobSiteAdapter,
  LinkedInAdapter,
  IndeedAdapter,
  ZipRecruiterAdapter
}; 