const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

// Constants
const APPLIED_JOBS_FILE = 'applied_jobs.json';
const MAX_APPLIED_JOBS = 1000; // Maximum number of jobs to track

/**
 * Job tracking utility to avoid applying to the same jobs repeatedly
 */
class JobTracker {
  constructor() {
    this.appliedJobs = new Set();
    this.trackerFile = path.join(process.cwd(), APPLIED_JOBS_FILE);
  }

  /**
   * Load applied jobs from file
   * @returns {Promise<void>}
   */
  async loadAppliedJobs() {
    try {
      const content = await fs.readFile(this.trackerFile, 'utf8');
      const jobs = JSON.parse(content);
      this.appliedJobs = new Set(jobs);
      logger.info(`Loaded ${this.appliedJobs.size} applied jobs from tracker`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing job tracker found, starting fresh');
      } else {
        logger.error(`Failed to load applied jobs: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Save applied jobs to file
   * @returns {Promise<void>}
   */
  async saveAppliedJobs() {
    try {
      const jobs = Array.from(this.appliedJobs);
      await fs.writeFile(this.trackerFile, JSON.stringify(jobs, null, 2));
      logger.info(`Saved ${jobs.length} applied jobs to tracker`);
    } catch (error) {
      logger.error(`Failed to save applied jobs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a job has already been applied to
   * @param {string} jobId - Unique job identifier
   * @returns {boolean} - Whether the job has been applied to
   */
  hasApplied(jobId) {
    return this.appliedJobs.has(jobId);
  }

  /**
   * Mark a job as applied
   * @param {string} jobId - Unique job identifier
   * @returns {Promise<void>}
   */
  async markAsApplied(jobId) {
    this.appliedJobs.add(jobId);
    await this.saveAppliedJobs();
    logger.info(`Marked job ${jobId} as applied`);
  }

  /**
   * Get all applied jobs
   * @returns {Array} - Array of applied jobs
   */
  getAppliedJobs() {
    return Array.from(this.appliedJobs);
  }

  /**
   * Clear all applied jobs
   * @returns {Promise<void>}
   */
  async clearAppliedJobs() {
    this.appliedJobs.clear();
    await this.saveAppliedJobs();
    logger.info('Cleared all applied jobs from tracker');
  }
}

// Export a singleton instance
module.exports = new JobTracker(); 