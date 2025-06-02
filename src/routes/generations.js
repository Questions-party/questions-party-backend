const express = require('express');
const {
  generateSentence,
  getUserGenerations,
  toggleLike,
  getGeneration,
  deleteGeneration,
  updateGenerationPrivacy,
  deleteAllGenerations
} = require('../controllers/generationController');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/generate
// @desc    Generate sentence with AI
// @access  Private (requires authentication)
router.post('/', auth, generateSentence);

// @route   GET /api/generations
// @desc    Get user's generations
// @access  Private (requires authentication)
router.get('/', auth, getUserGenerations);

// @route   DELETE /api/generations/all
// @desc    Delete all user's generations
// @access  Private (requires authentication)
router.delete('/all', auth, deleteAllGenerations);

// @route   GET /api/generations/:id
// @desc    Get single generation
// @access  Public with optional auth (public generations viewable by anyone, private only by owner)
router.get('/:id', optionalAuth, getGeneration);

// @route   POST /api/generations/:id/like
// @desc    Toggle like on generation
// @access  Private (AUTHENTICATION REQUIRED for liking)
router.post('/:id/like', auth, toggleLike);

// @route   PUT /api/generations/:id/privacy
// @desc    Update generation privacy
// @access  Private (requires authentication)
router.put('/:id/privacy', auth, updateGenerationPrivacy);

// @route   DELETE /api/generations/:id
// @desc    Delete generation
// @access  Private (requires authentication)
router.delete('/:id', auth, deleteGeneration);

module.exports = router; 