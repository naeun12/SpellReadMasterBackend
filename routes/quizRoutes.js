// routes/quizRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { generateLevels, getQuiz, generateSingleQuiz } = require('../controllers/quizController.js');

router.post('/generate-levels', authenticate, generateLevels);
router.get('/get-quiz/:level', authenticate, getQuiz);
router.post('/generate-single-quiz', authenticate, generateSingleQuiz);

module.exports = router;
