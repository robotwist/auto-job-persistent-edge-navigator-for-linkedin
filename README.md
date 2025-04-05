# Job Application Assistant

An automated job application assistant that helps you apply to multiple jobs across various job sites using AI and Playwright.

## Features

- **Multi-Platform Support**:
  - LinkedIn
  - Indeed
  - Glassdoor
  - Monster
  - Extensible architecture for adding more platforms

- **Smart Rate Limiting**:
  - Platform-specific request limits
  - Automatic cooldown periods
  - Request queue management
  - Anti-detection measures

- **AI-Powered Applications**:
  - Intelligent question answering
  - Context-aware responses
  - Binary question handling
  - Dropdown selection
  - Numeric input handling

- **Session Management**:
  - Persistent login sessions
  - Cookie management
  - Browser state preservation
  - Automatic retry mechanisms

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A modern web browser
- Accounts on job sites you want to use

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/job-application-assistant.git
cd job-application-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your credentials:
```env
# LinkedIn Credentials
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=your_password

# Indeed Credentials
INDEED_EMAIL=your@email.com
INDEED_PASSWORD=your_password

# Glassdoor Credentials
GLASSDOOR_EMAIL=your@email.com
GLASSDOOR_PASSWORD=your_password

# Monster Credentials
MONSTER_EMAIL=your@email.com
MONSTER_PASSWORD=your_password

# Personal Information
PHONE_NUMBER=your_phone_number
FIRST_NAME=your_first_name
LAST_NAME=your_last_name
LOCATION=your_location

# Job Search Configuration
JOB_TYPE=software_engineer
ACTIVE_PLATFORMS=linkedin,indeed,glassdoor,monster
MAX_PAGES=5
JOBS_PER_RUN=10
HEADLESS=false

# Logging Configuration
LOG_LEVEL=info
```

4. Configure your job profiles in `job_profiles.json`:
```json
{
  "profiles": {
    "software_engineer": {
      "title": "Software Engineer",
      "search_queries": ["Junior Software Engineer", "Software Developer"],
      "location": "Remote",
      "description": "Looking for junior software engineering positions",
      "years_of_experience": {
        "default": 1,
        "min": 0,
        "max": 2
      }
    }
  }
}
```

## Usage

1. Start the assistant:
```bash
npm start
```

2. The assistant will:
   - Log in to each active platform
   - Search for jobs based on your profile
   - Apply to jobs automatically
   - Handle application questions using AI
   - Respect rate limits for each platform

## Rate Limits

The assistant implements the following rate limits per platform:

- LinkedIn: 20 requests/minute, 100 requests/hour
- Indeed: 15 requests/minute, 80 requests/hour
- Glassdoor: 12 requests/minute, 60 requests/hour
- Monster: 15 requests/minute, 75 requests/hour

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational purposes only. Use it responsibly and in accordance with each job site's terms of service.
