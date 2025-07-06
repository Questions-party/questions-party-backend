const express = require('express');
const {
  getUserWords,
  addWord,
  deleteWord,
  getRandomWords,
  getWordStats,
  getPartsOfSpeech
} = require('../controllers/wordController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/words/random
// @desc    Get random words
// @access  Private
router.get('/random', auth, getRandomWords);

// @route   GET /api/words/stats
// @desc    Get word statistics
// @access  Private
router.get('/stats', auth, getWordStats);

// @route   GET /api/words/parts-of-speech
// @desc    Get available parts of speech
// @access  Private
router.get('/parts-of-speech', auth, getPartsOfSpeech);

// @route   GET /api/words
// @desc    Get user's words
// @access  Private
router.get('/', auth, getUserWords);

// @route   POST /api/words
// @desc    Add new word
// @access  Private
router.post('/', auth, addWord);

// @route   DELETE /api/words/:id
// @desc    Delete word
// @access  Private
router.delete('/:id', auth, deleteWord);

module.exports = router; 