const { chromium } = require('playwright');
const fs = require('fs');
const { answersDatabase, saveAnswer, handleNewQuestion, calculateSimilarity, getMostSimilarQuestion, normalizeAndTokenize } = require('./utils_Numeric.js');
const { answerDropDown, handleNewAnswerDropDown } = require('./utils_DropDown');
const { answerBinaryQuestions, handleNewQuestionBinary } = require('./utils_Binary.js');

const STATE_PATH = 'state.json';

async function saveLoginState(context) {
  await context.storageState({ path: STATE_PATH });
}

async function loadLoginState(browser) {
  if (fs.existsSync(STATE_PATH)) {
    return await browser.newContext({ storageState: STATE_PATH });
  } else {
    return await browser.newContext();
  }
}

async function answerNumericQuestions(page) {
  const questionElements = await page.$$('label.artdeco-text-input--label');
  for (let questionElement of questionElements) {
    const questionText = await questionElement.textContent();
    console.log("Question", questionText);

    const inputId = await questionElement.getAttribute('for');
    const answerElement = await page.$(`#${inputId}`);

    if (/years? of experience/i.test(questionText)) {
      const answer = '1';
      if (answerElement) {
        await answerElement.fill(answer);
        console.log(`Answered "${questionText}" with "${answer}"`);
      } else {
        console.log(`Input element not found for question: "${questionText}"`);
      }
      continue;
    }
    const normalizedQuestionText = normalizeAndTokenize(questionText.trim());
    const similarQuestions = Object.keys(answersDatabase).map(q => ({
      question: q,
      similarity: calculateSimilarity(normalizedQuestionText, normalizeAndTokenize(q))
    })).sort((a, b) => b.similarity - a.similarity);

    let answer = null;
    if (similarQuestions.length > 0 && similarQuestions[0].similarity > 0.5) {
      answer = answersDatabase[similarQuestions[0].question];
    } else {
      answer = await handleNewQuestion(questionText.trim());
    }
    const result = getMostSimilarQuestion(questionText.trim());
    let mostSimilarQuestion = null;
    let maxSimilarity = 0;

    if (result) {
      mostSimilarQuestion = result.mostSimilarQuestion;
      maxSimilarity = result.maxSimilarity;
    }

    if (answerElement && answer !== null) {
      await answerElement.fill(answer);
    } else {
      console.log(`No answer found or no suitable question found for: "${questionText.trim()}".`);
    }
  }
}

async function answerDropDownQuestions(page) {
  const dropdownElements = await page.$$('select');
  for (let dropdownElement of dropdownElements) {
    try {
      await dropdownElement.selectOption({ label: 'Yes' });
      console.log('Dropdown question answered with "Yes"');
    } catch (error) {
      console.error('Error selecting dropdown option:', error);
    }
  }
}

async function answerQuestions(page) {
  await answerNumericQuestions(page);
  await answerBinaryQuestions(page);
  await answerDropDownQuestions(page);
}

async function handleNextOrReview(page) {
  let hasNextButton = true;

  while (hasNextButton) {
    try {
      const nextButton = await page.$('button[aria-label="Continue to next step"]');
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(3000);
        await answerQuestions(page);
      } else {
        hasNextButton = false;
      }
    } catch (error) {
      hasNextButton = false;
    }
  }

  try {
    const reviewButton = await page.$('button[aria-label="Review your application"]');
    if (reviewButton) {
      await reviewButton.click();
      console.log("Review button successfully clicked");

      const submitButton = await page.$('button[aria-label="Submit application"]');
      if (submitButton) {
        await submitButton.click();
        console.log("Submit button clicked");

        await page.waitForTimeout(5000);
        await page.waitForSelector('button[aria-label="Dismiss"]', { visible: true });
        let modalButton = await page.$('button[aria-label="Dismiss"]');
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          try {
            await modalButton.evaluate(b => b.click());
            console.log("Dismiss button clicked");
            break;
          } catch (error) {
            console.log(`Attempt ${attempts + 1} failed: ${error.message}`);
            attempts++;
            await page.waitForTimeout(500);
            modalButton = await page.$('button[aria-label="Dismiss"]');
          }
        }

        if (attempts === maxAttempts) {
          console.log("Failed to click the Dismiss button after multiple attempts.");
        }
      }
    }
  } catch (error) {
    console.log('Review button not found or failed to click:', error.message);
  }
}

async function fillPhoneNumber(page, phoneNumber) {
  try {
    let inputElement;

    try {
      let labelName = "Mobile phone number";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
      return;
    } catch (error) {
      console.log("Mobile phone number input field not found, trying Phone label.");
    }

    try {
      let labelName = "Phone";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
    } catch (error) {
      console.log("Phone input field not found.");
    }

  } catch (error) {
    console.error("Error filling phone number:", error);
  }
}

async function getJobName(page) {
  try {
    const jobNameElement = await page.$('//h1[contains(@class,"t-24 t-bold")]//a[1]');
    if (jobNameElement) {
      const jobName = await jobNameElement.textContent();
      return jobName.trim();
    } else {
      return "Unknown Job";
    }
  } catch (error) {
    console.error("Error extracting job name:", error);
    return "Unknown Job";
  }
}

async function checkForCaptcha(page) {
  try {
    const captchaFrame = await page.frame({ name: /captcha/i });
    if (captchaFrame) {
      console.log('CAPTCHA detected. Please solve it manually.');
      await page.pause();
      console.log('CAPTCHA solved. Resuming script.');
    }
  } catch (error) {
    console.log('No CAPTCHA detected:', error.message);
  }
}

async function navigateWithRetry(page, url, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to navigate to ${url}`);
      await page.goto(url, { waitUntil: 'load', timeout: 90000 });
      return;
    } catch (error) {
      console.error(`Attempt ${attempt} to navigate to ${url} failed:`, error);
      if (attempt === retries) {
        throw error;
      }
      await page.waitForTimeout(10000);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await loadLoginState(browser);
  const page = await context.newPage();
  
  try {
    if (!fs.existsSync(STATE_PATH)) {
      await page.goto('https://www.linkedin.com/login');
      
      await page.fill('input[name="session_key"]', 'robwistrand@gmail.com');
      await page.fill('input[name="session_password"]', 'Vine087weed632!');
      await page.click('button[type="submit"]');
      
      await page.waitForSelector('a.global-nav__primary-link--active', { timeout: 0 });
      console.log('Login was Successful');
      
      await saveLoginState(context);
    } else {
      console.log('Using saved login state');
    }
    
    await navigateWithRetry(page, 'https://www.linkedin.com/jobs/');
    
    await page.waitForTimeout(3000);
    await page.getByRole('combobox', { name: 'Search by title, skill, or' }).click();
    await page.waitForTimeout(3000);

    await page.getByRole('combobox', { name: 'Search by title, skill, or' }).fill('Junior Software Engineer');
    await page.getByRole('combobox', { name: 'Search by title, skill, or' }).press('Enter');
    await page.waitForTimeout(5000);

    await page.waitForSelector("//button[@aria-label='Easy Apply filter.']");
    await page.click("//button[@aria-label='Easy Apply filter.']");
    
    console.log("Filter applied successfully");
    await page.waitForTimeout(3000);
    
    let currentPage = 1;
    let jobCounter = 0;

    while (true) {
      console.log(`Navigating to page ${currentPage}`);

      const jobListings = await page.$$('//div[contains(@class,"display-flex job-card-container")]');
      console.log(`Number of job listed on page ${currentPage}: ${jobListings.length}`);

      if (jobListings.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Exiting.`);
        break;
      }

      for (let job of jobListings) {
        try {
          jobCounter++;
          console.log(`Processing job ${jobCounter} on page ${currentPage}`);
          await job.click();
          
          const alreadyApplied = await page.$('span.artdeco-inline-feedback__message:has-text("Applied")');
          if (alreadyApplied) { 
            const jobName = await getJobName(page);
            console.log(`Already applied to the job: ${jobName}. Skipping.`);
            continue;
          }
          
          let easyApplyButton;

          try {
            easyApplyButton = await page.waitForSelector('button.jobs-apply-button', { timeout: 5000 });
            await easyApplyButton.click();
          } catch (error) {
            console.log('No Easy Apply button found or failed to click. Skipping this job.');
            continue;
          }

          await page.waitForTimeout(3000);

          const emailLabel = await page.$('label:has-text("Email address")') || await page.$('label:has-text("Email")');
          if (emailLabel) {
            const emailInputId = await emailLabel.getAttribute('for');
            await page.selectOption(`#${emailInputId}`, 'robwistrand@gmail.com');
          }

          try {
            const phoneCountryLabel = await page.$('label:has-text("Phone country code")');
            if (phoneCountryLabel) {
              const phoneCountryInputId = await phoneCountryLabel.getAttribute('for');
              await page.selectOption(`#${phoneCountryInputId}`, 'United States (+1)');
            }
          } catch (error) {
            console.log('Phone country code dropdown not found:', error.message);
          }

          await fillPhoneNumber(page, '831-291-6482');

          await page.waitForTimeout(3000);

          const buttonLabels = [
            'Continue to next step',
            'Submit application',
            'Review',
            'Next',
            'Done',
            'Save'
          ];

          let buttonClicked = false;

          for (const label of buttonLabels) {
            try {
              const button = await page.$(`button[aria-label="${label}"]`);
              if (button) {
                await button.click();
                console.log(`${label} button clicked`);
                buttonClicked = true;
                break;
              }
            } catch (error) {
              console.error(`Error clicking the ${label} button:`, error);
            }
          }

          if (!buttonClicked) {
            console.log("No suitable button found to progress the application");
          }

          await page.waitForTimeout(3000);

          await answerQuestions(page);
          await handleNextOrReview(page);

          try {
            const popupCloseButton = await page.$('button[aria-label="Dismiss"]') || await page.$('button[aria-label="Done"]') || await page.$('button[aria-label="Continue applying"]');
            if (popupCloseButton) {
              await popupCloseButton.click();
              console.log("Popup closed successfully");
            } else {
              console.log("No popup close button found");
            }
          } catch (error) {
            console.error("Error closing the popup:", error);
          }
        } catch (error) {
          console.error(`Error processing job ${jobCounter} on page ${currentPage}:`, error);
          continue;
        }
      }

      currentPage++;
      const nextPageButton = await page.$(`button[aria-label="Page ${currentPage}"]`);
      if (nextPageButton) {
        await nextPageButton.click();
        await page.waitForTimeout(5000);
        console.log(`Navigated to page ${currentPage}`);
      } else {
        console.log(`No more pages found. Exiting.`);
        break;
      }
    }
  } catch (error) {
    console.error("Script error:", error);
  } finally {
    await browser.close();
  }
})();
