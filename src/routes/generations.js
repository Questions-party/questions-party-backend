const express = require('express');
const {
  generateSentence,
  getUserGenerations,
  getPublicGenerations,
  toggleLike,
  getGeneration,
  deleteGeneration,
  updateGenerationPrivacy
} = require('../controllers/generationController');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/generate
// @desc    Generate sentence with AI
// @access  Private
router.post('/', auth, generateSentence);

// @route   GET /api/generations/public
// @desc    Get public generations feed
// @access  Public (with optional auth)
router.get('/public', optionalAuth, getPublicGenerations);

// @route   GET /api/generations
// @desc    Get user's generations
// @access  Private
router.get('/', auth, getUserGenerations);

// @route   GET /api/generations/:id
// @desc    Get single generation
// @access  Public (with optional auth)
router.get('/:id', optionalAuth, getGeneration);

// @route   POST /api/generations/:id/like
// @desc    Toggle like on generation
// @access  Private
router.post('/:id/like', auth, toggleLike);

// @route   PUT /api/generations/:id/privacy
// @desc    Update generation privacy
// @access  Private
router.put('/:id/privacy', auth, updateGenerationPrivacy);

// @route   DELETE /api/generations/:id
// @desc    Delete generation
// @access  Private
router.delete('/:id', auth, deleteGeneration);

module.exports = router; 