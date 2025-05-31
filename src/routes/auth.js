const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  updatePreferences
} = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public (no rate limiting)
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public (no rate limiting)
router.post('/login', login);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private (with rate limiting)
router.get('/me', authLimiter, auth, getMe);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private (with rate limiting)
router.put('/profile', authLimiter, auth, updateProfile);

// @route   PUT /api/auth/preferences
// @desc    Update user preferences
// @access  Private (with rate limiting)
router.put('/preferences', authLimiter, auth, updatePreferences);

module.exports = router; 