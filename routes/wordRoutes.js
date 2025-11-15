// routes/wordRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { addWord, editWord } = require('../controllers/wordController');

router.post('/add-word', authenticate, addWord);
router.put('/edit-word/:wordId', authenticate, editWord);

module.exports = router;
