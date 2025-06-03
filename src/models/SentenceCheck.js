const mongoose = require('mongoose');
const {formatDateToUTC8} = require("../utils/timeUtils");

const sentenceCheckSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalSentence: {
    type: String,
    required: true,
    trim: true,
    maxlength: 800
  },
  grammarAnalysis: {
    type: String,
    trim: true,
    maxlength: 30000
  },
  grammarCorrection: {
    type: String,
    trim: true,
    maxlength: 30000
  },
  keywordAnalysis: {
    type: String,
    trim: true,
    maxlength: 30000
  },
  chineseDefinition: {
    type: String,
    trim: true,
    maxlength: 30000
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
    default: 'Qwen/QwQ-32B'
  },
  promptVersion: {
    type: String,
    default: '1.0'
  },
  grammarLanguageOption: {
    type: String,
    enum: ['combined', 'pure'],
    default: 'combined'
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
sentenceCheckSchema.index({ userId: 1, createdAt: -1 });
sentenceCheckSchema.index({ isPublic: 1, createdAt: -1 });
sentenceCheckSchema.index({ isPublic: 1, likeCount: -1, createdAt: -1 });
sentenceCheckSchema.index({ 'likes.userId': 1 });

// Method to check if user has liked this sentence check
sentenceCheckSchema.methods.isLikedByUser = function(userId) {
  return this.likes.some(like => like.userId.toString() === userId.toString());
};

module.exports = mongoose.model('SentenceCheck', sentenceCheckSchema); 