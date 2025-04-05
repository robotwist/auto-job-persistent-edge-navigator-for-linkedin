const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

// Required environment variables
const REQUIRED_ENV_VARS = [
  'LINKEDIN_EMAIL',
  'LINKEDIN_PASSWORD',
  'EMAIL',
  'PHONE_NUMBER',
  'FIRST_NAME',
  'LAST_NAME',
  'LOCATION'
];

// Load environment variables
async function loadEnvConfig() {
  try {
    const envConfig = {};
    
    // Load from .env file if it exists
    try {
      const envPath = path.join(process.cwd(), '.env');
      const envContent = await fs.readFile(envPath, 'utf8');
      
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=').map(s => s.trim());
        if (key && value) {
          envConfig[key] = value;
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // Override with process.env
    Object.keys(process.env).forEach(key => {
      if (process.env[key]) {
        envConfig[key] = process.env[key];
      }
    });
    
    // Validate required variables
    const missingVars = REQUIRED_ENV_VARS.filter(key => !envConfig[key]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    logger.info('Environment configuration loaded successfully');
    return envConfig;
  } catch (error) {
    logger.error(`Failed to load environment configuration: ${error.message}`);
    throw error;
  }
}

// Load job profiles
async function loadJobProfiles() {
  try {
    const profilesPath = path.join(process.cwd(), 'job_profiles.json');
    const profilesContent = await fs.readFile(profilesPath, 'utf8');
    const profiles = JSON.parse(profilesContent);
    
    // Validate profiles
    if (!Array.isArray(profiles)) {
      throw new Error('Job profiles must be an array');
    }
    
    profiles.forEach((profile, index) => {
      if (!profile.title || !profile.search_queries || !Array.isArray(profile.search_queries)) {
        throw new Error(`Invalid job profile at index ${index}`);
      }
    });
    
    logger.info(`Loaded ${profiles.length} job profiles successfully`);
    return profiles;
  } catch (error) {
    logger.error(`Failed to load job profiles: ${error.message}`);
    throw error;
  }
}

module.exports = {
  loadEnvConfig,
  loadJobProfiles
}; 