const mongoose = require('mongoose');

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
    required: true,
    trim: true,
    maxlength: 1000
  },
  explanation: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  chineseTranslation: {
    type: String,
    trim: true,
    maxlength: 1000 // Chinese translations are typically shorter
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
    default: 'Qwen/QwQ-32B' // Updated default to SiliconFlow model
  },
  promptVersion: {
    type: String,
    default: '1.0'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ isPublic: 1, createdAt: -1 });
generationSchema.index({ isPublic: 1, likeCount: -1, createdAt: -1 });
generationSchema.index({ 'likes.userId': 1 });
generationSchema.index({ configId: 1 }); // Index for AI configuration tracking

// Method to check if user has liked this generation
generationSchema.methods.isLikedByUser = function(userId) {
  return this.likes.some(like => like.userId.toString() === userId.toString());
};

module.exports = mongoose.model('Generation', generationSchema); 