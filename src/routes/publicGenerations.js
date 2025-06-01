const express = require('express');
const {
  getPublicGenerations,
  getPublicStatistics
} = require('../controllers/generationController');

const router = express.Router();

// @route   GET /api/generations/public/stats
// @desc    Get public generations statistics
// @access  Public (NO AUTHENTICATION REQUIRED)
router.get('/stats', getPublicStatistics);

// @route   GET /api/generations/public
// @desc    Get public generations feed
// @access  Public (NO AUTHENTICATION REQUIRED)
router.get('/', getPublicGenerations);

module.exports = router; 