// routes/wordRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { addWord, editWord } = require('../controllers/wordController');
const cors = require('cors');

router.use(cors({
  origin: 'https://spellreadmasterfrontend-production.up.railway.app',
  credentials: true
}));

router.post('/add-word', authenticate, addWord);
router.put('/edit-word/:wordId', authenticate, editWord);

module.exports = router;
