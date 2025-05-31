const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    default: 'gpt-3.5-turbo'
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

// Method to check if user has liked this generation
generationSchema.methods.isLikedByUser = function(userId) {
  return this.likes.some(like => like.userId.toString() === userId.toString());
};

module.exports = mongoose.model('Generation', generationSchema); 