const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const Joi = require('joi');
const { getPublicKey } = require('../utils/rsaCrypto');
const redisClient = require('../config/redis');
const { validateEmail, mailUtils } = require('../utils/mailUtils');
const { generateVerificationCode, generateResetToken } = require('../utils/randomUtils');

// Redis key management methods
const RedisKeyManager = {
  // Password reset verification code keys
  getPasswordResetCodeKey: (email) => `password_reset:${email}`,
  
  // Password reset token keys
  getResetTokenKey: (email) => `reset_token:${email}`,
  
  // Store verification code with expiration
  storeVerificationCode: async (email, code, expirationSeconds = 300) => {
    const key = RedisKeyManager.getPasswordResetCodeKey(email);
    return await redisClient.setEx(key, expirationSeconds, code);
  },
  
  // Get verification code
  getVerificationCode: async (email) => {
    const key = RedisKeyManager.getPasswordResetCodeKey(email);
    return await redisClient.get(key);
  },
  
  // Remove verification code
  removeVerificationCode: async (email) => {
    const key = RedisKeyManager.getPasswordResetCodeKey(email);
    return await redisClient.del(key);
  },
  
  // Store reset token with expiration
  storeResetToken: async (email, token, expirationSeconds = 1800) => {
    const key = RedisKeyManager.getResetTokenKey(email);
    return await redisClient.setEx(key, expirationSeconds, token);
  },
  
  // Get reset token
  getResetToken: async (email) => {
    const key = RedisKeyManager.getResetTokenKey(email);
    return await redisClient.get(key);
  },
  
  // Remove reset token
  removeResetToken: async (email) => {
    const key = RedisKeyManager.getResetTokenKey(email);
    return await redisClient.del(key);
  }
};

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
      grammarExplanationLanguage: Joi.string().valid('combined', 'pure'),
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
      // If apiKey is provided and not empty, store the encrypted API key from frontend
      // Frontend should send RSA-encrypted API key with 'rsa:' prefix
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

// @desc    Get RSA public key for API key encryption
// @route   GET /api/auth/public-key
// @access  Public
exports.getPublicKey = async (req, res) => {
  try {
    const publicKey = getPublicKey();
    
    res.status(200).json({
      success: true,
      publicKey
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('auth.serverError')
    });
  }
};



// @desc    Send password reset code
// @route   POST /api/auth/forgot-password
// @access  Public
exports.sendResetCode = async (req, res) => {
  let verificationCode = null;
  let email = null;
  
  try {
    email = req.body.email;
    
    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.emailRequired')
      });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.invalidEmailFormat')
      });
    }
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t('auth.emailNotFound')
      });
    }
    
    // Generate 6-digit verification code
    verificationCode = generateVerificationCode();
    
    // Store code in Redis with 5-minute expiration
    await RedisKeyManager.storeVerificationCode(email, verificationCode);
    
    // Send email with verification code
    const locale = req.headers['x-language'] || 'en';
    await mailUtils.sendPasswordResetEmail(email, verificationCode, locale);
    
    res.status(200).json({
      success: true,
      message: req.t('auth.passwordResetCodeSent')
    });
  } catch (error) {
    console.error('Send reset code error:', error);
    
    // Clean up: remove verification code from Redis if it was stored
    if (email && verificationCode) {
      try {
        await RedisKeyManager.removeVerificationCode(email);
      } catch (cleanupError) {
        console.error('Failed to cleanup verification code:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorSendingResetCode')
    });
  }
};

// @desc    Verify password reset code
// @route   POST /api/auth/verify-reset-code
// @access  Public
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    
    // Validate inputs
    if (!email) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.emailRequired')
      });
    }
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.verificationCodeRequired')
      });
    }
    
    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.invalidVerificationCode')
      });
    }
    
    // Get code from Redis
    const storedCode = await RedisKeyManager.getVerificationCode(email);
    
    if (!storedCode) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.verificationCodeExpired')
      });
    }
    
    if (storedCode !== code) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.verificationCodeIncorrect')
      });
    }
    
    // Generate one-time reset token
    const resetToken = generateResetToken();
    
    // Store reset token in Redis with 30-minute expiration
    await RedisKeyManager.storeResetToken(email, resetToken);
    
    // Remove verification code from Redis
    await RedisKeyManager.removeVerificationCode(email);
    
    res.status(200).json({
      success: true,
      message: req.t('auth.verificationCodeVerified'),
      resetToken
    });
  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorVerifyingCode')
    });
  }
};

// @desc    Reset password using reset token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    
    // Validate inputs
    if (!email) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.emailRequired')
      });
    }
    
    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.resetTokenRequired')
      });
    }
    
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.newPasswordRequired')
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.passwordMinLength')
      });
    }
    
    // Verify reset token
    const storedToken = await RedisKeyManager.getResetToken(email);
    
    if (!storedToken || storedToken !== resetToken) {
      return res.status(400).json({
        success: false,
        message: req.t('auth.invalidResetToken')
      });
    }
    
    // Find user and update password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: req.t('auth.emailNotFound')
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Remove reset token from Redis
    await RedisKeyManager.removeResetToken(email);
    
    res.status(200).json({
      success: true,
      message: req.t('auth.passwordResetSuccessful')
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: req.t('auth.serverErrorResettingPassword')
    });
  }
}; 