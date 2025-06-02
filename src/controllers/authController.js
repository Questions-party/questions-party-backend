const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../../config/config');
const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).alphanum().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  username: Joi.string().min(3).max(30).alphanum(),
  email: Joi.string().email(),
  preferences: Joi.object({
    theme: Joi.string().valid('light', 'dark'),
    language: Joi.string().valid('en', 'zh'),
    showPublicGenerations: Joi.boolean()
  })
});

const generateToken = (id) => {
  return jwt.sign({ id }, config.jwtSecret, { expiresIn: '30d' });
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);
  
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      preferences: user.preferences,
      createdAt: user.createdAt
    }
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    // Validate input
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(400).json({
        success: false,
        message: req.t('auth.userWithFieldExists', { field })
      });
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorRegistration')
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    // Validate input
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { email, password } = req.body;

    // Check for user and include password for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: req.t('auth.invalidCredentials')
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: req.t('auth.invalidCredentials')
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorLogin')
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferences: user.preferences,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorGettingUserInfo')
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    // Validate input
    const { error } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { username, email, preferences } = req.body;
    const userId = req.user.id;

    // Check if username or email already exists for other users
    if (username || email) {
      const query = { _id: { $ne: userId } };
      if (username) query.username = username;
      if (email) query.email = email;

      const existingUser = await User.findOne(query);
      if (existingUser) {
        const field = existingUser.username === username ? 'username' : 'email';
        return res.status(400).json({
          success: false,
          message: req.t('auth.fieldTaken', { field })
        });
      }
    }

    // Update user
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (preferences) {
      updateData.preferences = { ...req.user.preferences, ...preferences };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferences: user.preferences,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorUpdatingProfile')
    });
  }
};

// @desc    Update user preferences only
// @route   PUT /api/auth/preferences
// @access  Private
exports.updatePreferences = async (req, res) => {
  try {
    const preferencesSchema = Joi.object({
      theme: Joi.string().valid('light', 'dark'),
      language: Joi.string().valid('en', 'zh'),
      showPublicGenerations: Joi.boolean(),
      fontSettings: Joi.object({
        size: Joi.string().valid('text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'),
        weight: Joi.string().valid('font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold'),
        lineHeight: Joi.string().valid('leading-tight', 'leading-normal', 'leading-relaxed', 'leading-loose'),
        family: Joi.string().valid('font-sans', 'font-serif', 'font-mono'),
        color: Joi.string().valid(
          'text-gray-700 dark:text-gray-300',
          'text-gray-900 dark:text-gray-100', 
          'text-blue-700 dark:text-blue-300',
          'text-green-700 dark:text-green-300',
          'text-purple-700 dark:text-purple-300',
          'text-red-700 dark:text-red-300'
        )
      })
    });

    const { error } = preferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { preferences: { ...req.user.preferences, ...req.body } } },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      preferences: user.preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorUpdatingPreferences')
    });
  }
};

// @desc    Update user font settings only
// @route   PUT /api/auth/font-settings
// @access  Private
exports.updateFontSettings = async (req, res) => {
  try {
    const fontSettingsSchema = Joi.object({
      size: Joi.string().valid('text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'),
      weight: Joi.string().valid('font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold'),
      lineHeight: Joi.string().valid('leading-tight', 'leading-normal', 'leading-relaxed', 'leading-loose'),
      family: Joi.string().valid('font-sans', 'font-serif', 'font-mono'),
      color: Joi.string().valid(
        'text-gray-700 dark:text-gray-300',
        'text-gray-900 dark:text-gray-100', 
        'text-blue-700 dark:text-blue-300',
        'text-green-700 dark:text-green-300',
        'text-purple-700 dark:text-purple-300',
        'text-red-700 dark:text-red-300'
      )
    });

    const { error } = fontSettingsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        $set: { 
          'preferences.fontSettings': { 
            ...req.user.preferences.fontSettings, 
            ...req.body 
          } 
        } 
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      fontSettings: user.preferences.fontSettings,
      message: req.t('auth.fontSettingsUpdatedSuccessfully')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorUpdatingFontSettings')
    });
  }
};

// @desc    Update user's API key
// @route   PUT /api/auth/api-key
// @access  Private
exports.updateApiKey = async (req, res) => {
  try {
    const { apiKey, useCustomApiKey } = req.body;

    // Validate input - only require apiKey if useCustomApiKey is true AND apiKey is provided
    // Allow setting useCustomApiKey = true with empty apiKey (user intends to use custom key but hasn't entered it yet)
    if (useCustomApiKey && apiKey && apiKey.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.apiKeyRequired')
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t('auth.userNotFound')
      });
    }

    // Update user's API key settings
    if (useCustomApiKey) {
      // If apiKey is provided and not empty, encrypt and store it
      // If apiKey is empty or not provided, just set the flag but keep apiKey undefined
      if (apiKey && apiKey.trim().length > 0) {
        user.apiKey = apiKey.trim();
      } else {
        user.apiKey = undefined;
      }
      user.useCustomApiKey = true;
    } else {
      user.apiKey = undefined;
      user.useCustomApiKey = false;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: req.t('auth.apiKeyUpdatedSuccessfully'),
      useCustomApiKey: user.useCustomApiKey
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverError')
    });
  }
};

// @desc    Test user's API key
// @route   POST /api/auth/test-api-key
// @access  Private
exports.testApiKey = async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || apiKey.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.apiKeyRequired')
      });
    }

    // Test the API key using AI service
    // Note: apiKey here is plaintext from frontend, testApiKey method expects plaintext
    const aiService = require('../services/aiService');
    const testResult = await aiService.testApiKey(apiKey.trim());

    if (testResult.success) {
      res.status(200).json({
        success: true,
        message: req.t('auth.apiKeyValidationSuccessful'),
        testResult
      });
    } else {
      res.status(400).json({
        success: false,
        message: req.t('auth.apiKeyValidationFailed', { error: testResult.error }),
        testResult
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverError')
    });
  }
};

// @desc    Get API key status
// @route   GET /api/auth/api-key-status
// @access  Private
exports.getApiKeyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('useCustomApiKey apiKey');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t('auth.userNotFound')
      });
    }

    // Get platform configuration info
    const aiService = require('../services/aiService');
    const platformInfo = aiService.getPlatformConfigInfo();

    res.status(200).json({
      success: true,
      useCustomApiKey: user.useCustomApiKey,
      hasCustomApiKey: !!(user.useCustomApiKey && user.apiKey),
      platformInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverError')
    });
  }
}; 