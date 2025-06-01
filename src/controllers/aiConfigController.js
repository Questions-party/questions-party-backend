const AIConfig = require('../models/AIConfig');
const aiService = require('../services/aiService');
const Joi = require('joi');
const mongoose = require('mongoose');

// Validation schemas
const createConfigSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  apiUrl: Joi.string().uri().required(),
  apiKey: Joi.string().min(1).required(),
  apiKeyPlacement: Joi.string().valid('header', 'body', 'custom_header').default('header'),
  apiKeyHeader: Joi.string().when('apiKeyPlacement', {
    is: 'custom_header',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  apiKeyBodyPath: Joi.string().when('apiKeyPlacement', {
    is: 'body',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  model: Joi.string().default('Qwen/QwQ-32B'),
  requestTemplate: Joi.object().required(),
  responseTemplate: Joi.object().optional(),
  requestMessageGroupPath: Joi.string().default('messages'),
  requestRolePathFromGroup: Joi.string().default('role'),
  requestTextPathFromGroup: Joi.string().default('content'),
  responseTextPath: Joi.string().default('choices[0].message.content'),
  responseThinkingTextPath: Joi.string().optional(),
  requestUserRoleField: Joi.string().default('user'),
  requestAssistantField: Joi.string().default('assistant'),
  requestSystemField: Joi.string().default('system'),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).default({ 'Content-Type': 'application/json' })
});

const updateConfigSchema = createConfigSchema.keys({
  name: Joi.string().min(1).max(100).optional(),
  apiUrl: Joi.string().uri().optional(),
  apiKey: Joi.string().min(1).optional(),
  requestTemplate: Joi.object().optional()
});

const testConfigSchema = Joi.object({
  secretKey: Joi.string().optional()
});

// @desc    Get user's AI configurations
// @route   GET /api/ai-configs
// @access  Private
exports.getConfigs = async (req, res) => {
  try {
    const configs = await AIConfig.find({ userId: req.user.id })
      .select('-apiKey') // Don't return API keys in list
      .sort({ lastUsedTime: -1 });

    res.status(200).json({
      success: true,
      configs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorFetchingConfigs')
    });
  }
};

// @desc    Get single AI configuration
// @route   GET /api/ai-configs/:id
// @access  Private
exports.getConfig = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    const config = await AIConfig.findOne({
      _id: id,
      userId: req.user.id
    }).select('-apiKey'); // Don't return API key

    if (!config) {
      return res.status(404).json({
        success: false,
        message: req.t('aiConfig.configNotFound')
      });
    }

    res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorFetchingConfigs')
    });
  }
};

// @desc    Create AI configuration
// @route   POST /api/ai-configs
// @access  Private
exports.createConfig = async (req, res) => {
  try {
    const { error, value } = createConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const config = await AIConfig.create({
      ...value,
      userId: req.user.id,
      lastUsedTime: new Date(),
      isAvailable: false // Will be set to true after successful test
    });

    // Return config without API key
    const responseConfig = await AIConfig.findById(config._id).select('-apiKey');

    res.status(201).json({
      success: true,
      config: responseConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorCreatingConfig')
    });
  }
};

// @desc    Update AI configuration
// @route   PUT /api/ai-configs/:id
// @access  Private
exports.updateConfig = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    const { error, value } = updateConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const config = await AIConfig.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { 
        ...value,
        lastUsedTime: new Date(),
        isAvailable: false // Reset availability after update
      },
      { new: true }
    ).select('-apiKey');

    if (!config) {
      return res.status(404).json({
        success: false,
        message: req.t('aiConfig.configNotFound')
      });
    }

    res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorUpdatingConfig')
    });
  }
};

// @desc    Delete AI configuration
// @route   DELETE /api/ai-configs/:id
// @access  Private
exports.deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    const config = await AIConfig.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: req.t('aiConfig.configNotFound')
      });
    }

    res.status(200).json({
      success: true,
      message: req.t('aiConfig.configDeletedSuccessfully')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorDeletingConfig')
    });
  }
};

// @desc    Test AI configuration
// @route   POST /api/ai-configs/:id/test
// @access  Private
exports.testConfig = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    const { error, value } = testConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { secretKey } = value;

    // Get the configuration with API key for testing
    const config = await AIConfig.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: req.t('aiConfig.configNotFound')
      });
    }

    // Test the configuration
    const testResult = await aiService.testConfiguration(config, secretKey);

    // Update availability based on test result
    if (testResult.success) {
      await AIConfig.findByIdAndUpdate(id, {
        isAvailable: true,
        lastUsedTime: new Date()
      });

      res.status(200).json({
        success: true,
        message: req.t('aiConfig.configTestSuccessful'),
        testResult
      });
    } else {
      await AIConfig.findByIdAndUpdate(id, {
        isAvailable: false
      });

      res.status(400).json({
        success: false,
        message: req.t('aiConfig.configTestFailed', { message: testResult.error || 'Unknown error' }),
        testResult
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorTestingConfig')
    });
  }
};

// @desc    Create default SiliconFlow configuration for user
// @route   POST /api/ai-configs/default
// @access  Private
exports.createDefaultConfig = async (req, res) => {
  try {
    // Check if user already has a default configuration
    const existingConfig = await AIConfig.findOne({
      userId: req.user.id,
      name: 'SiliconFlow Default'
    });

    if (existingConfig) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Create default configuration using the AI service
    const config = await aiService.createDefaultSiliconFlowConfig(req.user.id);

    // Return config without API key
    const responseConfig = await AIConfig.findById(config._id).select('-apiKey');

    res.status(201).json({
      success: true,
      config: responseConfig,
      message: req.t('aiConfig.defaultConfigCreated')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('aiConfig.serverErrorCreatingConfig')
    });
  }
}; 