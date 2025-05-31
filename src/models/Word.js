const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 50
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  definition: {
    type: String,
    trim: true,
    maxlength: 500
  },
  partOfSpeech: {
    type: String,
    enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner']
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate words per user
wordSchema.index({ word: 1, userId: 1 }, { unique: true });

// Index for better query performance
wordSchema.index({ userId: 1, createdAt: -1 });
wordSchema.index({ usageCount: -1 });

module.exports = mongoose.model('Word', wordSchema); 