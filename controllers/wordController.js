// controllers/wordController.js
const { db } = require('../config/firebase');

// Helper: Determine phonics type based on phonicsPattern
function determineType(phonicsPattern) {
  const level1Patterns = ['CVC', 'VC', 'CV', 'double_consonant'];
  const level2Patterns = ['blends_fl', 'blends_st', 'digraph_sh', 'digraph_ch', 'digraph_th'];
  const level3Patterns = ['silent_e', 'long_vowel_ai', 'vowel_team_oa', 'vowel_team_ee'];
  const level4Patterns = ['r_controlled_ar', 'r_controlled_er', 'diphthong_oi', 'diphthong_ou'];
  const level5Patterns = ['multisyllabic', 'compound', 'sight_word_irregular'];

  if (level1Patterns.includes(phonicsPattern)) return 'phonics_level_1';
  if (level2Patterns.includes(phonicsPattern)) return 'phonics_level_2';
  if (level3Patterns.includes(phonicsPattern)) return 'phonics_level_3';
  if (level4Patterns.includes(phonicsPattern)) return 'phonics_level_4';
  if (level5Patterns.includes(phonicsPattern)) return 'phonics_level_5';
  return 'unknown';
}

// Helper: Determine EXP based on difficulty
function determineExp(difficulty) {
  switch(difficulty.toLowerCase()) {
    case 'easy': return 10;
    case 'medium': return 20;
    case 'hard': return 30;
    default: return 10;
  }
}

// POST /add-word
async function addWord(req, res) {
  try {
    const { word, phonicsPattern, difficulty, emoji, exampleSentence } = req.body;

    if (!word || !phonicsPattern || !difficulty) {
      return res.status(400).json({ message: 'Word, phonicsPattern, and difficulty are required' });
    }

    const type = determineType(phonicsPattern);
    const expValue = determineExp(difficulty);

    const newWord = {
      word,
      phonicsPattern,
      difficulty,
      type,
      expValue,
      emoji: emoji || '📝',
      exampleSentence: exampleSentence || '',
      addedBy: req.user.uid
    };

    await db.collection('wordBank').doc(word).set(newWord);

    res.status(200).json({ message: 'Word saved successfully', word: newWord });
  } catch (error) {
    console.error('Error adding/updating word:', error);
    res.status(500).json({ message: 'Error saving word', error });
  }
}

// PUT /edit-word/:wordId
async function editWord(req, res) {
  try {
    const { wordId } = req.params;
    const { difficulty, phonicsPattern, emoji, exampleSentence } = req.body;

    if (!difficulty || !phonicsPattern) {
      return res.status(400).json({ message: 'difficulty and phonicsPattern are required for update' });
    }

    const type = determineType(phonicsPattern);
    const expValue = determineExp(difficulty);

    const updatedWordData = {
      difficulty,
      phonicsPattern,
      type,
      expValue,
      emoji,
      exampleSentence
    };

    await db.collection('wordBank').doc(wordId).update(updatedWordData);

    const updatedDoc = await db.collection('wordBank').doc(wordId).get();
    const updatedWord = { id: updatedDoc.id, ...updatedDoc.data() };

    res.status(200).json({ message: 'Word updated successfully', word: updatedWord });
  } catch (error) {
    console.error('Error updating word:', error);
    res.status(500).json({ message: 'Error updating word', error });
  }
}

module.exports = { addWord, editWord };
