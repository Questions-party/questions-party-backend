const express = require('express');
const {
  getConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  testConfig,
  createDefaultConfig
} = require('../controllers/aiConfigController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All AI config routes require authentication
router.use(auth);

// @route   GET /api/ai-configs
// @desc    Get user's AI configurations
// @access  Private
router.get('/', getConfigs);

// @route   POST /api/ai-configs/default
// @desc    Create default SiliconFlow configuration
// @access  Private
router.post('/default', createDefaultConfig);

// @route   POST /api/ai-configs
// @desc    Create AI configuration
// @access  Private
router.post('/', createConfig);

// @route   GET /api/ai-configs/:id
// @desc    Get single AI configuration
// @access  Private
router.get('/:id', getConfig);

// @route   PUT /api/ai-configs/:id
// @desc    Update AI configuration
// @access  Private
router.put('/:id', updateConfig);

// @route   DELETE /api/ai-configs/:id
// @desc    Delete AI configuration
// @access  Private
router.delete('/:id', deleteConfig);

// @route   POST /api/ai-configs/:id/test
// @desc    Test AI configuration
// @access  Private
router.post('/:id/test', testConfig);

module.exports = router; 