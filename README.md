# Job Application Bot

An automated job application tool that helps you apply to jobs across multiple job sites including LinkedIn, Indeed, and ZipRecruiter. The tool is designed to streamline your job search process by automatically filling in application forms and answering common screening questions.

## Features

- **Multi-platform support**: Apply to jobs on LinkedIn, Indeed, and ZipRecruiter
- **Customizable job profiles**: Different profiles for junior developer, QA engineer, and technical support roles
- **Smart answer database**: Learns from your answers to provide appropriate responses to application questions
- **Automatic form filling**: Fills in contact information and other personal details
- **Pattern recognition**: Automatically detects question types and selects appropriate answers
- **Robust error handling**: Continues running even if individual applications fail
- **Detailed logging**: Keeps track of all applications and errors for review

## Prerequisites

- Node.js (v14 or later)
- NPM or Yarn
- A LinkedIn, Indeed, or ZipRecruiter account

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/job-application-bot.git
   cd job-application-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the example:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file with your credentials:
   ```
   # LinkedIn credentials
   LINKEDIN_EMAIL=your_email@example.com
   LINKEDIN_PASSWORD=your_password

   # Indeed credentials (if using Indeed)
   INDEED_EMAIL=your_email@example.com
   INDEED_PASSWORD=your_password

   # ZipRecruiter credentials (if using ZipRecruiter)
   ZIPRECRUITER_EMAIL=your_email@example.com
   ZIPRECRUITER_PASSWORD=your_password

   # Personal information
   EMAIL=your_email@example.com
   PHONE_NUMBER=123-456-7890
   FIRST_NAME=John
   LAST_NAME=Doe
   LOCATION=City, State
   ```

## Configuration

The tool can be configured via the `config.json` file. A default configuration will be created when you first run the tool.

```json
{
  "jobSearchQueries": ["Junior Software Engineer", "QA Engineer", "Technical Support"],
  "currentJobType": "junior_developer",
  "maxPages": 5,
  "jobsPerRun": 20,
  "activePlatforms": ["linkedin"],
  "location": "",
  "headless": false
}
```

You can also customize job profiles in the `job_profiles.json` file.

## Usage

### Basic usage

```
npm start
```

This will start the application with the default configuration, using the profile specified in `config.json`.

### Run with a specific platform

```
npm run apply:linkedin
npm run apply:indeed
npm run apply:ziprecruiter
```

### Run with a specific job profile

```
npm run profile:dev     # Junior Developer profile
npm run profile:qa      # QA Engineer profile
npm run profile:support # Technical Support profile
```

### Custom command line options

You can also run with custom options:

```
node main.js --platform=linkedin --profile=junior_developer --pages=3 --jobs=10
```

## Logs

Application logs are stored in the `logs` directory. Each run creates a new log file with the current date as the filename.

## Handling Application Questions

The bot has three ways of answering application questions:

1. **From database**: Uses previously saved answers
2. **From profile**: Uses answers defined in the job profile
3. **Interactive**: Prompts you for an answer if a suitable one cannot be found

For the first run, you may need to provide answers to some questions, but the bot will learn from these and use them in future applications.

## Customizing Answer Databases

Answer databases are stored in three JSON files:

- `numeric_response.json`: For questions requiring numeric or text input
- `binary_response.json`: For yes/no questions
- `dropdown_response.json`: For dropdown selection questions

You can edit these files directly to adjust the answers.

## Security Notes

- Credentials are stored in the `.env` file which should never be committed to version control
- Session state is saved locally to avoid frequent logins
- The tool runs with visible browser windows by default to help with debugging and CAPTCHA solving

## Troubleshooting

### Common Issues

1. **Login problems**: Check your credentials in the `.env` file
2. **CAPTCHA challenges**: The tool will pause if it detects a CAPTCHA; solve it manually
3. **Selector errors**: If the job site changes its UI, the selectors may need updating
4. **Rate limiting**: Don't apply to too many jobs too quickly to avoid being blocked

### Debug Mode

Run with debug logging for more detailed information:

```
DEBUG=true npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is provided for educational purposes only. Using automation tools may violate the terms of service of job sites. Use at your own risk.