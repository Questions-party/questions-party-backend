const express = require('express');
const router = express.Router();
const { getGlobalStatistics } = require('../controllers/statisticsController');

// @route   GET /api/statistics
// @desc    Get global public statistics
// @access  Public
router.get('/', getGlobalStatistics);

module.exports = router; 