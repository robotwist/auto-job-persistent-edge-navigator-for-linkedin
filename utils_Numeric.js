const fs = require('fs');
const natural = require('natural');
const { TfIdf, WordTokenizer, PorterStemmer } = natural;
const readline = require('readline');
const path = require('path');

// Load or initialize answers database
const answersFilePath = './numeric_response.json';
let answersDatabase = {};

// Load job profiles for dynamic answers
const jobProfilesPath = './job_profiles.json';
let jobProfiles = {};
let currentProfile = 'junior_developer'; // Default profile

// Load job profiles if available
if (fs.existsSync(jobProfilesPath)) {
  try {
    const data = fs.readFileSync(jobProfilesPath, 'utf8');
    jobProfiles = JSON.parse(data);
    console.log('Job profiles loaded successfully');
  } catch (error) {
    console.error('Error loading job profiles:', error);
  }
} else {
  console.log('Job profiles file not found. Using default values.');
}

if (fs.existsSync(answersFilePath)) {
  try {
    const data = fs.readFileSync(answersFilePath, 'utf8');
    answersDatabase = JSON.parse(data);
  } catch (error) {
    console.error('Error parsing answers file:', error);
    // Create a backup if the file is corrupted
    if (fs.existsSync(answersFilePath)) {
      const backupPath = `${answersFilePath}.backup.${Date.now()}`;
      fs.copyFileSync(answersFilePath, backupPath);
      console.log(`Created backup of corrupted file at ${backupPath}`);
    }
    answersDatabase = {};
  }
} else {
  console.log('answers.json file not found. Creating a new one.');
  fs.writeFileSync(answersFilePath, JSON.stringify(answersDatabase, null, 2));
}

// Set the active job profile
function setJobProfile(profileKey) {
  if (jobProfiles[profileKey]) {
    currentProfile = profileKey;
    console.log(`Switched to job profile: ${jobProfiles[profileKey].title}`);
    return true;
  } else {
    console.error(`Profile "${profileKey}" not found`);
    return false;
  }
}

// Array of keywords representing technologies or topics
const keywords = [
  "javascript", "typescript", "node.js", "react.js", "angular", "vue.js", // JavaScript Frameworks/Libraries
  "python", "django", "flask", // Python frameworks
  "java", "spring", "spring boot", // Java frameworks
  "aws", "azure", "google cloud", "cloud computing", // Cloud Platforms
  "docker", "kubernetes", "containerization", // DevOps and Containers
  "sql", "nosql", "mongodb", "postgresql", "mysql", "Databases",// Databases
  "git", "github", "gitlab", // Version Control (Git)
  "agile", "scrum", "kanban", // Agile Methodologies
  "machine learning", "deep learning", "artificial intelligence", "data science", // AI/ML and Data Science
  "html", "css", "sass", "bootstrap", "Web Development", // Web Technologies (HTML/CSS)
  "restful api", "graphql", // APIs and Architectures
  "microservices", "serverless", // Microservices and Serverless Architecture
  "devops", "continuous integration", "continuous deployment", // DevOps Practices
  "software engineering", "software development", "full stack", // Software Engineering and Full Stack
  "cybersecurity", "network security", // Cybersecurity
  "react native", "mobile development", // Mobile Development
  "blockchain", "ethereum", "smart contracts", // Blockchain
  "agile methodologies", "lean methodologies", // Agile and Lean Methodologies
  "big data", "apache spark", "hadoop", // Big Data
  "C++", "C", "Kotlin", // Programming languages
  "software testing", "teamcenter", "dita xml" // Additional skills
];

// Helper function to normalize and tokenize text, ignoring common introductory phrases
function normalizeAndTokenize(text) {
  const regex = /^(how many years of work experience do you have with|how many years of do you have with|how many years of do you have|how many years of experience do you have with|how many years of experience do you have)/i;
  const processedText = text.replace(regex, '');
  
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(processedText.toLowerCase());
  return tokens.map(token => PorterStemmer.stem(token)).join(' ');
}

function saveAnswer(question, answer) {
  answersDatabase[question] = answer;
  try {
    fs.writeFileSync(answersFilePath, JSON.stringify(answersDatabase, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving answer to file:', error);
  }
}

async function handleNewQuestion(question) {
  console.log(`No sufficiently similar question found for: "${question}". Using profile-based answer or prompt.`);
  
  // Check if this is an experience question
  const experienceRegex = /(how many years|years of|experience with|experience do you have)/i;
  if (experienceRegex.test(question)) {
    // Extract skill or technology
    const cleanedQuestion = normalizeAndTokenize(question.trim());
    
    // Try to find the skill in the current profile
    if (jobProfiles[currentProfile] && jobProfiles[currentProfile].yearsOfExperience) {
      for (const skill in jobProfiles[currentProfile].yearsOfExperience) {
        if (cleanedQuestion.includes(normalizeAndTokenize(skill).toLowerCase())) {
          const answer = jobProfiles[currentProfile].yearsOfExperience[skill];
          console.log(`Using profile-based answer for "${question}": ${answer}`);
          saveAnswer(question, answer);
          return answer;
        }
      }
      
      // If no specific skill found, use default
      if (jobProfiles[currentProfile].yearsOfExperience.default) {
        const answer = jobProfiles[currentProfile].yearsOfExperience.default;
        console.log(`Using default experience for "${question}": ${answer}`);
        saveAnswer(question, answer);
        return answer;
      }
    }
  }
  
  // Check if this is a salary question
  const salaryRegex = /(salary|compensation|expected salary|current salary|ctc)/i;
  if (salaryRegex.test(question)) {
    if (jobProfiles[currentProfile] && jobProfiles[currentProfile].expectedSalary) {
      const answer = jobProfiles[currentProfile].expectedSalary;
      console.log(`Using profile-based salary for "${question}": ${answer}`);
      saveAnswer(question, answer);
      return answer;
    }
  }
  
  // Fallback to user input
  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(`Answer for "${question}": `, (input) => {
      rl.close();
      resolve(input.trim());
    });
  });

  saveAnswer(question, answer);
  return answer;
}

// Function to calculate cosine similarity using TF-IDF, adjusted for specific keywords
function calculateSimilarity(question1, question2) {
  const tfidf = new TfIdf();
  tfidf.addDocument(normalizeAndTokenize(question1));
  tfidf.addDocument(normalizeAndTokenize(question2));
  
  let similarity = 0;
  tfidf.listTerms(0).forEach(function(item) {
    const term = item.term;
    const tfidf1 = tfidf.tfidf(term, 0);
    const tfidf2 = tfidf.tfidf(term, 1);
    similarity += tfidf1 * tfidf2;
  });
  
  return similarity;
}

// Function to find the closest question based on TF-IDF similarity, prioritizing DB contains keywords
function getMostSimilarQuestion(question) {
  const questions = Object.keys(answersDatabase);
  if (questions.length === 0) return null;

  if (answersDatabase.hasOwnProperty(question)) {
    return { mostSimilarQuestion: question, maxSimilarity: 1.0 };
  }
  
  let mostSimilarQuestion = null;
  let maxSimilarity = -1;

  for (const q of questions) {
    const dbContainsKeyword = keywords.some(keyword => q.toLowerCase().includes(keyword));
    
    if (dbContainsKeyword) {
      let similarity = calculateSimilarity(question, q);
      
      const inputContainsKeyword = keywords.some(keyword => question.toLowerCase().includes(keyword));

      if (inputContainsKeyword) {
        similarity *= 1.2;
      }

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarQuestion = q;
      }
    }
  }

  if (!mostSimilarQuestion) {
    for (const q of questions) {
      if (!keywords.some(keyword => q.toLowerCase().includes(keyword))) {
        let similarity = calculateSimilarity(question, q);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarQuestion = q;
        }
      }
    }
  }

  if (maxSimilarity < 0.4) {
    return null;
  }

  return { mostSimilarQuestion, maxSimilarity };
}

module.exports = {
  answersDatabase,
  saveAnswer,
  handleNewQuestion,
  calculateSimilarity,
  getMostSimilarQuestion,
  normalizeAndTokenize,
  setJobProfile,
  jobProfiles,
  currentProfile
};
