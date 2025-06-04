const mongoose = require('mongoose');
const {formatDateToUTC8} = require("../utils/timeUtils");

const generationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  configId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIConfig',
    required: false // Optional for backward compatibility
  },
  words: [{
    type: String,
    required: true,
    trim: true,
    lowercase: true
  }],
  sentence: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  explanation: {
    type: String,
    trim: true,
    maxlength: 30000
  },
  chineseTranslation: {
    type: String,
    trim: true,
    maxlength: 30000 // Chinese translations are typically shorter
  },
  thinkingText: {
    type: String,
    trim: true,
    maxlength: 30000 // Support longer thinking content from QwQ model
  },
  rawResponseContent: {
    type: String,
    trim: true,
    maxlength: 30000 // Store raw AI response for debugging/fallback when parsing fails
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  likeCount: {
    type: Number,
    default: 0,
    min: 0
  },
  aiModel: {
    type: String,
    default: 'Qwen/QwQ-32B' // Updated default to SiliconFlow model
  },
  promptVersion: {
    type: String,
    default: '1.0'
  },
  // Dynamic model selection information
  modelSelection: {
    inputSize: {
      type: Number, // Number of words used for generation
      required: false
    },
    selectedModel: {
      type: String, // Actual model used (e.g., 'Qwen/Qwen3-8B')
      required: false
    },
    selectionReason: {
      type: String, // Reason for model selection (e.g., 'Word count: 5 words')
      required: false
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
      // Format likes createdAt
      if (ret.likes && Array.isArray(ret.likes)) {
        ret.likes.forEach(like => {
          if (like.createdAt) {
            like.createdAt = formatDateToUTC8(like.createdAt);
          }
        });
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
      // Format likes createdAt
      if (ret.likes && Array.isArray(ret.likes)) {
        ret.likes.forEach(like => {
          if (like.createdAt) {
            like.createdAt = formatDateToUTC8(like.createdAt);
          }
        });
      }
      return ret;
    }
  }
});

// Indexes for better query performance
generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ isPublic: 1, createdAt: -1 });
generationSchema.index({ isPublic: 1, likeCount: -1, createdAt: -1 });
generationSchema.index({ 'likes.userId': 1 });
generationSchema.index({ configId: 1 }); // Index for AI configuration tracking
generationSchema.index({ 'modelSelection.selectedModel': 1 }); // Index for model selection tracking

// Method to check if user has liked this generation
generationSchema.methods.isLikedByUser = function(userId) {
  return this.likes.some(like => like.userId.toString() === userId.toString());
};

module.exports = mongoose.model('Generation', generationSchema); 