const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
  timestamps: true
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// API key encryption middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('apiKey') || !this.apiKey) return next();
  
  // Only encrypt if it's not already encrypted
  if (!this.apiKey.startsWith('enc:')) {
    this.apiKey = this.encryptApiKey(this.apiKey);
  }
  next();
});

// Method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to encrypt API key
userSchema.methods.encryptApiKey = function(plaintext) {
  try {
    const algorithm = 'aes-256-cbc';
    const secretKey = process.env.API_KEY_ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
    
    // Generate salt and IV
    const salt = crypto.randomBytes(8);
    const iv = crypto.randomBytes(16);
    
    // Derive key using PBKDF2 (similar to OpenSSL EVP_BytesToKey)
    const key = crypto.pbkdf2Sync(secretKey, salt, 10000, 32, 'md5');
    
    // Create cipher
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Combine salt + iv + encrypted data (FIXED: now includes IV)
    const result = Buffer.concat([
      Buffer.from('Salted__', 'utf8'),
      salt,
      iv,
      encrypted
    ]);
    
    return 'enc:' + result.toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

// Method to decrypt API key
userSchema.methods.decryptApiKey = function(encryptedKey = null) {
  try {
    const keyToDecrypt = encryptedKey || this.apiKey;
    
    if (!keyToDecrypt || !keyToDecrypt.startsWith('enc:')) {
      return keyToDecrypt; // Return as-is if not encrypted
    }
    
    const algorithm = 'aes-256-cbc';
    const secretKey = process.env.API_KEY_ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
    
    // Remove 'enc:' prefix and decode base64
    const cipherData = Buffer.from(keyToDecrypt.substring(4), 'base64');
    
    // Extract salt and IV (FIXED: now extracts IV from stored data)
    const salt = cipherData.slice(8, 16);   // Salt: bytes 8-15
    const iv = cipherData.slice(16, 32);    // IV: bytes 16-31
    const encrypted = cipherData.slice(32); // Encrypted data: bytes 32+
    
    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(secretKey, salt, 10000, 32, 'md5');
    
    // Create decipher using the extracted IV
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
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