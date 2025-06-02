const express = require('express');
const { auth } = require('../middleware/auth');
const sentenceCheckController = require('../controllers/sentenceCheckController');

const router = express.Router();

// @route   POST /api/check (when mounted on /api/check)
// @route   GET /api/checks (when mounted on /api/checks)
// @desc    Check sentence with AI OR Get user's sentence checks
// @access  Private
router.route('/')
  .post(auth, sentenceCheckController.checkSentence)
  .get(auth, sentenceCheckController.getUserSentenceChecks);

// @route   GET /api/checks/:id
// @desc    Get single sentence check
// @access  Public (for public checks) / Private (for user's own checks)
router.get('/:id', sentenceCheckController.getSentenceCheck);

// @route   POST /api/checks/:id/like
// @desc    Toggle like on sentence check
// @access  Private
router.post('/:id/like', auth, sentenceCheckController.toggleLike);

// @route   PUT /api/checks/:id/privacy
// @desc    Update sentence check privacy
// @access  Private
router.put('/:id/privacy', auth, sentenceCheckController.updateSentenceCheckPrivacy);

// @route   DELETE /api/checks/:id
// @desc    Delete sentence check
// @access  Private
router.delete('/:id', auth, sentenceCheckController.deleteSentenceCheck);

// @route   DELETE /api/checks/all
// @desc    Delete all user's sentence checks
// @access  Private
router.delete('/all', auth, sentenceCheckController.deleteAllSentenceChecks);

module.exports = router; 