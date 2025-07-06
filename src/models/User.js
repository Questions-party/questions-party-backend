const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {formatDateToUTC8} = require("../utils/timeUtils");
const { decrypt } = require('../utils/rsaCrypto');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  // Custom API key for SiliconFlow (optional - if not set, platform default is used)
  // Stored encrypted in database
  apiKey: {
    type: String,
    required: false,
    trim: true
  },
  // Whether the user is using a custom API key
  useCustomApiKey: {
    type: Boolean,
    default: false
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    language: {
      type: String,
      enum: ['en', 'zh'],
      default: 'en'
    },
    showPublicGenerations: {
      type: Boolean,
      default: true
    },
    grammarExplanationLanguage: {
      type: String,
      enum: ['combined', 'pure'],
      default: 'combined'
    },
    fontSettings: {
      size: {
        type: String,
        enum: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'],
        default: 'text-base'
      },
      weight: {
        type: String,
        enum: ['font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold'],
        default: 'font-normal'
      },
      lineHeight: {
        type: String,
        enum: ['leading-tight', 'leading-normal', 'leading-relaxed', 'leading-loose'],
        default: 'leading-relaxed'
      },
      family: {
        type: String,
        enum: ['font-sans', 'font-serif', 'font-mono'],
        default: 'font-sans'
      },
      color: {
        type: String,
        enum: [
          'text-gray-700 dark:text-gray-300',
          'text-gray-900 dark:text-gray-100', 
          'text-blue-700 dark:text-blue-300',
          'text-green-700 dark:text-green-300',
          'text-purple-700 dark:text-purple-300',
          'text-red-700 dark:text-red-300'
        ],
        default: 'text-gray-700 dark:text-gray-300'
      }
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Format timestamps
      if (ret.createdAt) {
        ret.createdAt = formatDateToUTC8(ret.createdAt);
      }
      if (ret.updatedAt) {
        ret.updatedAt = formatDateToUTC8(ret.updatedAt);
      }
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      // Format timestamps
      if (ret.createdAt) {
        ret.createdAt = formatDateToUTC8(ret.createdAt);
      }
      if (ret.updatedAt) {
        ret.updatedAt = formatDateToUTC8(ret.updatedAt);
      }
      return ret;
    }
  }
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// API key encryption is now handled with RSA in frontend before transmission

// Method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to decrypt API key using RSA
userSchema.methods.decryptApiKey = function(encryptedKey = null) {
  try {
    const keyToDecrypt = encryptedKey || this.apiKey;
    
    if (!keyToDecrypt) {
      return null;
    }

    // Check if it's RSA encrypted (base64 format from frontend)
    if (keyToDecrypt.startsWith('rsa:')) {
      const encryptedData = keyToDecrypt.substring(4);
      return decrypt(encryptedData);
    }
    
    // If not encrypted, return as-is (for development/testing)
    return keyToDecrypt;
  } catch (error) {
    throw new Error(`API key decryption failed: ${error.message}`);
  }
};

// Method to get decrypted API key for AI service use
userSchema.methods.getDecryptedApiKey = function() {
  if (!this.apiKey || !this.useCustomApiKey) {
    return null;
  }
  return this.decryptApiKey();
};

module.exports = mongoose.model('User', userSchema); 