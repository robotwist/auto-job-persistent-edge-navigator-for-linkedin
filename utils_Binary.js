const fs = require('fs');
const readline = require('readline');

//-------------------------------------------------2.Binary response HANDLER-------------------------
const binaryAnswersFilePath  = './binary_response.json';
let binaryAnswersDatabase  = {};

// Common question patterns and their default answers based on intent
const commonBinaryQuestions = {
  authorization: {
    patterns: [
      'legally authorized to work',
      'work authorization',
      'sponsorship',
      'visa status'
    ],
    defaultAnswer: 'Yes',
    sponsorshipAnswer: 'No'  // For questions about needing sponsorship
  },
  relocation: {
    patterns: [
      'willing to relocate',
      'relocate to',
      'comfortable commuting',
      'relocating to'
    ],
    defaultAnswer: 'Yes'
  },
  workMode: {
    patterns: [
      'remote setting',
      'hybrid setting',
      'onsite setting',
      'work from home',
      'telecommute',
      'work remotely'
    ],
    defaultAnswer: 'Yes'
  },
  education: {
    patterns: [
      'bachelor\'s degree',
      'master\'s degree',
      'degree in',
      'completed education'
    ],
    defaultAnswer: 'Yes'
  },
  startDate: {
    patterns: [
      'start immediately',
      'available to start',
      'start date',
      'when can you start'
    ],
    defaultAnswer: 'Yes'
  },
  background: {
    patterns: [
      'background check',
      'drug test',
      'security clearance'
    ],
    defaultAnswer: 'Yes'
  }
};

if (fs.existsSync(binaryAnswersFilePath)) {
  try {
    const data = fs.readFileSync(binaryAnswersFilePath, 'utf8');
    binaryAnswersDatabase = JSON.parse(data);
  } catch (error) {
    console.error('Error parsing binary answers file:', error);
    // Create a backup if the file is corrupted
    if (fs.existsSync(binaryAnswersFilePath)) {
      const backupPath = `${binaryAnswersFilePath}.backup.${Date.now()}`;
      fs.copyFileSync(binaryAnswersFilePath, backupPath);
      console.log(`Created backup of corrupted file at ${backupPath}`);
    }
    binaryAnswersDatabase = {};
  }
} else {
  console.log('binary_response.json file not found. Creating a new one.');
  fs.writeFileSync(binaryAnswersFilePath, JSON.stringify(binaryAnswersDatabase, null, 2));
}

// Function to get a smart default answer based on question content
function getSmartDefaultAnswer(questionText) {
  const lowerQuestion = questionText.toLowerCase();
  
  // Special case for sponsorship questions - usually the answer should be "No"
  if (/require sponsorship|need.*sponsorship|sponsorship.*required/.test(lowerQuestion)) {
    return commonBinaryQuestions.authorization.sponsorshipAnswer;
  }
  
  // Check all patterns
  for (const category in commonBinaryQuestions) {
    for (const pattern of commonBinaryQuestions[category].patterns) {
      if (lowerQuestion.includes(pattern.toLowerCase())) {
        return commonBinaryQuestions[category].defaultAnswer;
      }
    }
  }
  
  // Default fallback
  return 'Yes';
}

async function answerBinaryQuestions(page) {
  const binaryQuestionSelectors = [
    'fieldset[data-test-form-builder-radio-button-form-component="true"]',
    // Additional selectors for other types of binary questions
    'div.jobs-easy-apply-form-section__grouping:has(input[type="radio"])'
  ];

  for (let selector of binaryQuestionSelectors) {
    try {
      const questionElements = await page.$$(selector);
      for (let questionElement of questionElements) {
        try {
          const questionTextElement = await questionElement.$('span[data-test-form-builder-radio-button-form-component__title], legend, label');
          
          if (!questionTextElement) {
            console.log("Could not find question text element, skipping this question");
            continue;
          }
          
          const questionText = (await questionTextElement.textContent()).trim();
          console.log("Binary Question:", questionText);

          let answer = binaryAnswersDatabase[questionText];

          if (!answer) {
            answer = getSmartDefaultAnswer(questionText);
            console.log(`Using smart default answer "${answer}" for question: "${questionText}"`);
            
            // Save this answer for future reference
            binaryAnswersDatabase[questionText] = answer;
            try {
              fs.writeFileSync(binaryAnswersFilePath, JSON.stringify(binaryAnswersDatabase, null, 2));
            } catch (error) {
              console.error('Error saving binary answer to file:', error);
            }
          }

          // Find the appropriate radio button
          try {
            // First try to find by direct value
            let radioButton = await questionElement.$(`input[value="${answer}"]`);
            
            // If not found, try Yes/No variations
            if (!radioButton) {
              if (answer.toLowerCase() === 'yes') {
                radioButton = await questionElement.$('input[value="Yes"], input[value="yes"], input[value="true"], input[value="Y"]');
              } else if (answer.toLowerCase() === 'no') {
                radioButton = await questionElement.$('input[value="No"], input[value="no"], input[value="false"], input[value="N"]');
              }
            }

            if (radioButton) {
              await radioButton.scrollIntoViewIfNeeded();
              await radioButton.click({ force: true });
              console.log(`Clicked "${answer}" for "${questionText}"`);
            } else {
              console.log(`Could not find radio button for answer "${answer}" to question "${questionText}"`);
            }
          } catch (error) {
            console.error(`Failed to click radio button: ${error}`);
          }
        } catch (error) {
          console.error(`Error processing binary question: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error with selector ${selector}: ${error}`);
    }
  }
}

async function handleNewQuestionBinary(questionText) {
  console.log(`New binary question: "${questionText}". Determining best answer...`);
  
  // Try to get a smart default
  const smartDefault = getSmartDefaultAnswer(questionText);
  console.log(`Smart default answer for "${questionText}" is "${smartDefault}"`);
  
  // Prompt the user if they want to override the smart default
  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`Use "${smartDefault}" for "${questionText}"? (Y/n/custom answer): `, (input) => {
      rl.close();
      if (!input || input.toLowerCase() === 'y') {
        resolve(smartDefault);
      } else if (input.toLowerCase() === 'n') {
        resolve(smartDefault === 'Yes' ? 'No' : 'Yes');
      } else {
        resolve(input.trim());
      }
    });
  });

  return answer;
}

module.exports = {
  answerBinaryQuestions,
  handleNewQuestionBinary,
  binaryAnswersDatabase
};