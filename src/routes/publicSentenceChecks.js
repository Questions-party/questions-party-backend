const express = require('express');
const sentenceCheckController = require('../controllers/sentenceCheckController');

const router = express.Router();

// @route   GET /api/checks/public
// @desc    Get public sentence checks feed
// @access  Public
router.get('/', sentenceCheckController.getPublicSentenceChecks);

// @route   GET /api/checks/public/stats
// @desc    Get public sentence check statistics
// @access  Public
router.get('/stats', sentenceCheckController.getPublicStatistics);

module.exports = router; 