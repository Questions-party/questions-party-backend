const mongoose = require('mongoose');

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
    required: true,
    trim: true,
    maxlength: 3000
  },
  grammarCorrection: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  keywordAnalysis: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  chineseDefinition: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  thinkingText: {
    type: String,
    trim: true,
    maxlength: 5000 // Support longer thinking content from QwQ model
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
  timestamps: true
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