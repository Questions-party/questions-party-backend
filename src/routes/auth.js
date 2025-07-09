const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  updatePreferences,
  updateFontSettings,
  updateApiKey,
  testApiKey,
  getApiKeyStatus,
  getPublicKey,
  sendResetCode,
  verifyResetCode,
  resetPassword
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

// @route   PUT /api/auth/font-settings
// @desc    Update user font settings
// @access  Private (with rate limiting)
router.put('/font-settings', authLimiter, auth, updateFontSettings);

// @route   PUT /api/auth/api-key
// @desc    Update user's API key
// @access  Private (with rate limiting)
router.put('/api-key', authLimiter, auth, updateApiKey);

// @route   POST /api/auth/test-api-key
// @desc    Test user's API key
// @access  Private (with rate limiting)
router.post('/test-api-key', authLimiter, auth, testApiKey);

// @route   GET /api/auth/api-key-status
// @desc    Get API key status and platform info
// @access  Private (with rate limiting)
router.get('/api-key-status', authLimiter, auth, getApiKeyStatus);

// @route   GET /api/auth/public-key
// @desc    Get RSA public key for API key encryption
// @access  Public (no rate limiting needed)
router.get('/public-key', getPublicKey);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset code
// @access  Public (with rate limiting)
router.post('/forgot-password', authLimiter, sendResetCode);

// @route   POST /api/auth/verify-reset-code
// @desc    Verify password reset code
// @access  Public (with rate limiting)
router.post('/verify-reset-code', authLimiter, verifyResetCode);

// @route   POST /api/auth/reset-password
// @desc    Reset password using reset token
// @access  Public (with rate limiting)
router.post('/reset-password', authLimiter, resetPassword);

module.exports = router; 