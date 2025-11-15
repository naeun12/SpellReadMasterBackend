const { db } = require('../config/firebase');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// EXP Configuration (matches your frontend config)
const LEVEL_RULES = {
  MAX_EXP_PER_QUIZ: 100,
  MIN_EXP_TO_ADVANCE: 80,
};

// ✅ FIX 1: Refactored word distribution function for efficiency and clarity
function calculateWordDistribution(targetExp, availableWords) {
  const expValues = { easy: 10, medium: 15, hard: 20 };
  const distribution = { easy: 0, medium: 0, hard: 0 };
  let currentExp = 0;

  // Group words by difficulty for efficient selection
  const groupedWords = availableWords.reduce((acc, word) => {
    acc[word.difficulty] = acc[word.difficulty] || [];
    acc[word.difficulty].push(word);
    return acc;
  }, {});

  // Strategy: Prioritize Hardest (20 EXP) down to Easiest (10 EXP)
  for (const difficulty of ['hard', 'medium', 'easy']) {
    const wordExp = expValues[difficulty];
    const available = groupedWords[difficulty] || [];

    // Select words of this difficulty until targetExp is met
    for (let i = 0; i < available.length; i++) {
      if (currentExp + wordExp <= targetExp) {
        distribution[difficulty]++;
        currentExp += wordExp;
      } else {
        break;
      }
    }
  }

  if (currentExp < targetExp * 0.8) {
    console.warn(`Could not generate words close to target ${targetExp} EXP. Current: ${currentExp}`);
  }

  return { distribution, actualExp: currentExp };
}

// Updated: Generate levels with focus on nested weakAreas
async function generateLevels(req, res) {
  try {
    console.log("🔥 generateLevels called!");
    console.log("Input weakAreas:", JSON.stringify(req.body.weakAreas, null, 2));

    const { startingLevel = 1, weakAreas = {} } = req.body;
    const uid = req.user.uid;
    const hasWeakAreas = Object.keys(weakAreas).length > 0;

    // Fetch ALL words
    const wordSnapshot = await db.collection('wordBank').get();
    const allWords = [];
    wordSnapshot.forEach(doc => {
      allWords.push(doc.data());
    });

    if (allWords.length === 0) {
      console.log("❌ No words found in wordBank collection!");
      return res.status(404).json({ error: 'No words found in wordBank' });
    }

    console.log(`Fetched ${allWords.length} total words from wordBank`);

    const quizzes = {};
    const totalLevels = 10;
    
    // Initialize a Set to track all words used across all levels (Prevent duplication)
    const usedWordIdentifiers = new Set(); 
    console.log("Starting word identifier tracking...");

    for (let i = 0; i < totalLevels; i++) {
      const levelNum = startingLevel + i;
      const targetExp = LEVEL_RULES.MAX_EXP_PER_QUIZ;

      // Filter the master list to exclude any words already used in previous levels
      const availableWords = allWords.filter(word => !usedWordIdentifiers.has(word.word));
      console.log(`Level ${levelNum}: ${availableWords.length} words available after filtering used words`);
      
      let selectedWords = [];
      let levelWords = [];

      if (hasWeakAreas) {
        // PASS 1: Exact match — same type AND phonicsPattern
        const exactMatchWords = availableWords.filter(word =>
          weakAreas[word.type]?.includes(word.phonicsPattern)
        );
        console.log(`Level ${levelNum}: Found ${exactMatchWords.length} exact matches (type + phonicsPattern)`);

        // PASS 2: Type-only fallback — same type, any pattern
        const typeMatchWords = availableWords.filter(word =>
          weakAreas[word.type] && !exactMatchWords.some(w => w.word === word.word)
        );
        console.log(`Level ${levelNum}: Found ${typeMatchWords.length} type-only matches`);

        // Combine: prefer exact matches, then type-only if needed
        levelWords = [...exactMatchWords, ...typeMatchWords];
      } else {
        // No weak areas → use any available word
        levelWords = availableWords;
        console.log(`Level ${levelNum}: Using all available words (no weak areas)`);
      }

      console.log(`Level ${levelNum}: Total candidate words: ${levelWords.length}`);

      if (levelWords.length === 0) {
        console.warn(`No words available for level ${levelNum}. Skipping.`);
        continue;
      }

      // Calculate word distribution to meet target EXP
      const { distribution, actualExp } = calculateWordDistribution(targetExp, levelWords);
      console.log(`Level ${levelNum}: Distribution needed - Easy: ${distribution.easy}, Medium: ${distribution.medium}, Hard: ${distribution.hard}`);

      // Select words WITHOUT reuse (even within level)
      const selectedSet = new Set(); // prevent accidental duplicates in selection
      selectedWords = [];

      for (const [difficulty, count] of Object.entries(distribution)) {
        if (count <= 0) continue;

        // Pick unused words of this difficulty
        const candidates = levelWords.filter(
          w => w.difficulty === difficulty && !selectedSet.has(w.word)
        ).slice(0, count);

        candidates.forEach(w => {
          selectedSet.add(w.word);
          selectedWords.push(w);
        });
        
        console.log(`Level ${levelNum}: Selected ${candidates.length} ${difficulty} words`);
      }

      console.log(`Level ${levelNum}: Final selected words:`, selectedWords.map(w => w.word));

      if (selectedWords.length === 0) {
        console.warn(`Could not select valid words for level ${levelNum}. Skipping.`);
        continue;
      }
      
      console.log(`Level ${levelNum}: Selected ${selectedWords.length} unique words.`);

      // Mark selected words as used for subsequent levels
      selectedWords.forEach(word => usedWordIdentifiers.add(word.word));
      console.log(`Total words used so far: ${usedWordIdentifiers.size}`);

      // Generate quiz content with AI using selected words
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const wordListString = selectedWords.map(w => w.word).join(', ');
      const prompt = `
        Create ${selectedWords.length} spelling questions for a Grade 1 student.
        The student needs practice with these specific patterns: ${Object.entries(weakAreas).map(([type, patterns]) => `${type}: ${patterns.join(', ')}`).join('; ')}. 
        Use ONLY these words: ${wordListString}.
        Make questions supportive and clear (e.g., include picture hints, simple sentences).
        Return JSON: [{"question": "...", "answer": "...", "word": "...", "difficulty": "...", "expValue": "...", "hint": "..."}].
        Ensure the "expValue" matches the word's difficulty (easy=10, medium=15, hard=20).
      `;

      let questions = [];
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const clean = text.replace(/```json|```/g, '').trim();
        questions = JSON.parse(clean);

        // Validate AI output matches selected words and exp values
        questions = questions.filter(q => {
          const matchingWord = selectedWords.find(w => w.word.toLowerCase() === q.answer.toLowerCase());
          if (matchingWord) {
            q.expValue = matchingWord.expValue || (matchingWord.difficulty === 'easy' ? 10 : matchingWord.difficulty === 'medium' ? 15 : 20);
            q.word = matchingWord.word;
            return true;
          }
          return false;
        });
        
        console.log(`Level ${levelNum}: AI generated ${questions.length} questions, ${questions.length} valid`);
      } catch (e) {
        console.error(`AI generation failed for level ${levelNum}, using fallback:`, e.message);
        // Fallback: Create simple questions
        questions = selectedWords.map(w => ({
          question: `Spell: ${w.word}`,
          answer: w.word,
          word: w.word,
          difficulty: w.difficulty,
          expValue: w.expValue || (w.difficulty === 'easy' ? 10 : w.difficulty === 'medium' ? 15 : 20),
          hint: 'Listen carefully to the word.'
        }));
        
        console.log(`Level ${levelNum}: Fallback generated ${questions.length} questions`);
      }

      // Store the quiz 
      quizzes[`level_${levelNum}`] = {
        questions,
        maxPossibleExp: actualExp,
        expReward: actualExp,
        generatedAt: new Date(),
        generatedForWeakAreas: weakAreas
      };
    }

    console.log("Generated quizzes for levels:", Object.keys(quizzes));
    
    // Verify no word repetition across all levels
    const allUsedWords = new Set();
    const duplicateWords = [];
    
    Object.entries(quizzes).forEach(([levelKey, quizData]) => {
      quizData.questions.forEach(q => {
        if (allUsedWords.has(q.word)) {
          duplicateWords.push(q.word);
        }
        allUsedWords.add(q.word);
      });
    });
    
    if (duplicateWords.length > 0) {
      console.error("❌ DUPLICATE WORDS FOUND ACROSS LEVELS:", duplicateWords);
    } else {
      console.log("✅ No duplicate words found across levels");
    }

    // Save to Firestore
    await db.collection('studentLevelQuizzes').doc(uid).set({
      startingLevel,
      weakAreas,
      quizzes
    }, { merge: true });

    console.log("✅ Successfully generated and saved quizzes for user:", uid);

    res.json({
      success: true,
      generatedLevels: Object.keys(quizzes).length,
      startingLevel,
      targetExpPerQuiz: LEVEL_RULES.MAX_EXP_PER_QUIZ,
      duplicateWords: duplicateWords.length > 0 ? duplicateWords : null
    });
  } catch (err) {
    console.error('Generate Levels Error:', err);
    res.status(500).json({ error: 'Failed to generate levels', details: err.message });
  }
}

// Updated: Generate a single quiz dynamically based on nested weakAreas
async function generateSingleQuiz(req, res) {
  try {
    const { level, weakAreas = {}, remedial = false, missedWords = [] } = req.body;
    const uid = req.user.uid;
    const levelNum = parseInt(level);

    // Fetch ALL words
    const wordSnapshot = await db.collection('wordBank').get();
    const allWords = [];
    wordSnapshot.forEach(doc => allWords.push(doc.data()));

    let levelWords = [];

    if (remedial && missedWords.length > 0) {
      // Remedial path: focus on missed words
      const missedWordSet = new Set(missedWords.map(w => w.toLowerCase()));
      levelWords = allWords.filter(w => missedWordSet.has(w.word.toLowerCase()));
    } else {
      // Standard path: focus on weak areas
      levelWords = allWords.filter(word => {
        if (weakAreas[word.type]) {
          // Check for exact match first
          if (weakAreas[word.type].includes(word.phonicsPattern)) {
            return true;
          }

          // If no exact match, try flexible matching
          return weakAreas[word.type].some(weakPattern => {
            if (word.phonicsPattern.startsWith(weakPattern)) return true;
            if (weakPattern.startsWith(word.phonicsPattern)) return true;
            if (word.phonicsPattern.includes(weakPattern) || weakPattern.includes(word.phonicsPattern)) return true;
            return false;
          });
        }
        return false;
      });
    }

    // ✅ FIX 5: Implement Fallback if the initial weak area filter failed (and it's not a remedial quiz)
    if (levelWords.length === 0 && !remedial) {
        console.warn(`No words found matching weakAreas. Falling back to general words for level ${level}.`);
        
        // FALLBACK: Load general words for this level
        levelWords = allWords.filter(word => word.level === levelNum); 
    }

    if (levelWords.length === 0) {
        return res.status(404).json({ error: `No words available for level ${level}` });
    }

    const targetExp = LEVEL_RULES.MAX_EXP_PER_QUIZ;
    const { distribution, actualExp } = calculateWordDistribution(targetExp, levelWords);

    let selectedWords = [];
    for (const [difficulty, count] of Object.entries(distribution)) {
      const wordsForDifficulty = levelWords.filter(w => w.difficulty === difficulty).slice(0, count);
      selectedWords = selectedWords.concat(wordsForDifficulty);
    }

    if (selectedWords.length === 0) {
      return res.status(404).json({ error: `Could not select appropriate words for level ${level} to meet target EXP ${targetExp}` });
    }

    // Generate quiz with AI
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const wordListString = selectedWords.map(w => w.word).join(', ');
    const prompt = `
      Create ${selectedWords.length} spelling questions for a Grade 1 student.
      The student needs practice with these specific patterns: ${Object.entries(weakAreas).map(([type, patterns]) => `${type}: ${patterns.join(', ')}`).join('; ')}. 
      Use ONLY these words: ${wordListString}.
      Make questions supportive and clear (e.g., include picture hints, simple sentences).
      Return JSON: [{"question": "...", "answer": "...", "word": "...", "difficulty": "...", "expValue": "...", "hint": "..."}].
      Ensure the "expValue" matches the word's difficulty (easy=10, medium=15, hard=20).
    `;

    let questions = [];
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const clean = text.replace(/```json|```/g, '').trim();
      questions = JSON.parse(clean);

      questions = questions.filter(q => {
        const matchingWord = selectedWords.find(w => w.word.toLowerCase() === q.answer.toLowerCase());
        if (matchingWord) {
          q.expValue = matchingWord.expValue || (matchingWord.difficulty === 'easy' ? 10 : matchingWord.difficulty === 'medium' ? 15 : 20);
          q.word = matchingWord.word;
          return true;
        }
        return false;
      });
    } catch (e) {
      console.error(`AI generation failed for single quiz level ${level}, using fallback:`, e.message);
      questions = selectedWords.map(w => ({
        question: `Spell: ${w.word}`,
        answer: w.word,
        word: w.word,
        difficulty: w.difficulty,
        expValue: w.expValue || (w.difficulty === 'easy' ? 10 : w.difficulty === 'medium' ? 15 : 20),
        hint: 'Listen carefully to the word.'
      }));
    }

    // Update Firestore
    await db.collection('studentLevelQuizzes').doc(uid).set({
      [`quizzes.level_${level}`]: {
        questions,
        maxPossibleExp: actualExp,
        expReward: actualExp,
        generatedAt: new Date(),
        generatedForWeakAreas: weakAreas
      }
    }, { merge: true });

    res.json({
      success: true,
      level: levelNum,
      questionsCount: questions.length,
      maxPossibleExp: actualExp,
      remedial
    });
  } catch (error) {
    console.error('Generate Single Quiz Error:', error);
    res.status(500).json({ error: 'Failed to generate quiz', details: error.message });
  }
}

// No changes needed for getQuiz
async function getQuiz(req, res) {
  try {
    console.log("🔍 [getQuiz] Function called.");
    const { level } = req.params; // e.g., "2" from /quiz/get-quiz/2
    const uid = req.user.uid; // The UID extracted by the auth middleware

    // 1. Construct the correct Firestore key
    const levelStr = String(level);
    const levelKey = `level_${levelStr}`; // Example: "level_2"

    console.log(`[getQuiz] Requesting Level: ${levelStr}, Key: '${levelKey}' for UID: ${uid}`);

    // 2. Fetch the document
    const quizDoc = await db.collection('studentLevelQuizzes').doc(uid).get();

    if (!quizDoc.exists) {
      console.log(`[getQuiz] ❌ Document does not exist for user ${uid}. Responding with 404.`);
      return res.status(404).json({ error: 'No quizzes generated for this student' });
    }

    const docData = quizDoc.data();
    
    // Check for the main 'quizzes' field
    if (!docData || !docData.quizzes) {
      console.log(`[getQuiz] ❌ 'quizzes' field not found in document for user ${uid}. Responding with 404.`);
      return res.status(404).json({ error: 'No quizzes field found in student data' });
    }

    const quizzes = docData.quizzes;

    
    
    // 3. Attempt to access the specific level data
    const quizDataForLevel = quizzes[levelKey];
    
    if (!quizDataForLevel) {
      console.log(`[getQuiz] ❌ Key '${levelKey}' not found in quizzes object. Responding with 404.`);
      return res.status(404).json({ error: `No quiz available for level ${level}` });
    }

    // 4. Check for 'mastered' status or empty questions array
    const { questions, expReward, ...metadata } = quizDataForLevel;
    
    // Check if the level is marked as "mastered" (optional logic, based on your system design)
    if (metadata.isMastered === true) {
        console.log(`[getQuiz] 🎉 Level ${level} is mastered. Sending mastered status.`);
        // Front-end logic handles this status to award EXP and complete the level
        return res.json({ 
            level: parseInt(level),
            status: 'mastered', 
            message: `Level ${level} mastered!`, 
            expReward: expReward || 100 
        });
    }

    // Check if a quiz exists but has no questions (e.g., it was generated empty)
    if (!questions || questions.length === 0) {
        // Since the key exists, return a 200 OK with an empty quiz, 
        // which might trigger a generation attempt on the front-end, or be treated as complete.
        console.log(`[getQuiz] ⚠️ Found level data, but questions array is empty. Sending empty quiz.`);
         return res.json({ 
            level: parseInt(level),
            questions: [], 
            message: 'Quiz data is empty, need to generate new questions.'
        });
    }

    // 5. Success: Send the quiz data back
    console.log(`[getQuiz] ✅ Found quiz data with ${questions.length} questions for level ${level}. Responding with 200.`);

    res.json({ 
        level: parseInt(level), // Include the level number
        questions: questions,
        expReward: expReward,
        ...metadata 
    });

  } catch (error) {
    console.error('[getQuiz] 💥 Fatal error:', error);
    // Use a 500 status code for unexpected server errors
    res.status(500).json({ error: 'Failed to fetch quiz due to a server error', details: error.message });
  }
}
module.exports = { generateLevels, getQuiz, generateSingleQuiz };