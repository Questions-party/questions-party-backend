const mongoose = require('mongoose');
const {formatDateToUTC8} = require("../utils/timeUtils");

const wordSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 50
  },
  userIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  // WordNet-retrieved data
  definitions: [{
    text: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    partOfSpeech: {
      type: String,
      enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner', 'adjective satellite']
    }
  }],
  // Primary part of speech (most common)
  primaryPartOfSpeech: {
    type: String,
    enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner', 'adjective satellite']
  },
  // Primary definition (first/most common)
  primaryDefinition: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Track if WordNet lookup was successful
  wordNetProcessed: {
    type: Boolean,
    default: false
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

// Compound index to prevent duplicate words per user
wordSchema.index({ word: 1, userIds: 1 }, { unique: true });

// Index for better query performance
wordSchema.index({ userIds: 1, createdAt: -1 });
wordSchema.index({ usageCount: -1 });
wordSchema.index({ primaryPartOfSpeech: 1 });

module.exports = mongoose.model('Word', wordSchema); 