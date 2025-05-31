const Word = require('../models/Word');
const Joi = require('joi');
const mongoose = require('mongoose');

// Validation schemas
const addWordSchema = Joi.object({
  word: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\-']+$/).required(),
  definition: Joi.string().max(500),
  partOfSpeech: Joi.string().valid('noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner')
});

const randomWordsSchema = Joi.object({
  count: Joi.number().integer().min(1).max(500).default(5),
  includeAll: Joi.boolean().default(false)
});

// @desc    Get user's words
// @route   GET /api/words
// @access  Private
exports.getUserWords = async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'recent', search } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { userId: req.user.id };
    
    // Add search filter if provided
    if (search) {
      query.word = { $regex: search.trim(), $options: 'i' };
    }

    // Build sort criteria
    let sortCriteria;
    switch (sortBy) {
      case 'alphabetical':
        sortCriteria = { word: 1 };
        break;
      case 'usage':
        sortCriteria = { usageCount: -1, createdAt: -1 };
        break;
      default:
        sortCriteria = { createdAt: -1 };
    }

    // Get words with pagination
    const words = await Word.find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Word.countDocuments(query);

    res.status(200).json({
      success: true,
      words,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + words.length < total,
        totalWords: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching words'
    });
  }
};

// @desc    Add new word
// @route   POST /api/words
// @access  Private
exports.addWord = async (req, res) => {
  try {
    // Validate input
    const { error } = addWordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { word, definition, partOfSpeech } = req.body;
    const cleanWord = word.toLowerCase().trim();

    // Check if word already exists for this user
    const existingWord = await Word.findOne({
      word: cleanWord,
      userId: req.user.id
    });

    if (existingWord) {
      return res.status(400).json({
        success: false,
        message: 'Word already exists in your collection'
      });
    }

    // Create new word
    const newWord = await Word.create({
      word: cleanWord,
      userId: req.user.id,
      definition: definition?.trim(),
      partOfSpeech
    });

    res.status(201).json({
      success: true,
      word: newWord
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Word already exists in your collection'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error adding word'
    });
  }
};

// @desc    Update word
// @route   PUT /api/words/:id
// @access  Private
exports.updateWord = async (req, res) => {
  try {
    const { definition, partOfSpeech } = req.body;
    
    // Validate input
    const updateSchema = Joi.object({
      definition: Joi.string().max(500),
      partOfSpeech: Joi.string().valid('noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner')
    });

    const { error } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    // Find and update word
    const word = await Word.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { 
        definition: definition?.trim(),
        partOfSpeech 
      },
      { new: true, runValidators: true }
    );

    if (!word) {
      return res.status(404).json({
        success: false,
        message: 'Word not found'
      });
    }

    res.status(200).json({
      success: true,
      word
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error updating word'
    });
  }
};

// @desc    Delete word
// @route   DELETE /api/words/:id
// @access  Private
exports.deleteWord = async (req, res) => {
  try {
    const word = await Word.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!word) {
      return res.status(404).json({
        success: false,
        message: 'Word not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Word deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error deleting word'
    });
  }
};

// @desc    Get random words
// @route   GET /api/words/random
// @access  Private
exports.getRandomWords = async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = randomWordsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { count, includeAll } = value;

    // Build query based on includeAll parameter
    const query = includeAll ? {} : { userId: req.user.id };

    // Get total count to check if we have enough words
    const totalWords = await Word.countDocuments(query);

    if (totalWords === 0) {
      return res.status(404).json({
        success: false,
        message: includeAll ? 'No words found in the system' : 'No words found in your collection'
      });
    }

    // Limit count to available words
    const actualCount = Math.min(count, totalWords);

    // Get random words using aggregation
    const words = await Word.aggregate([
      { $match: query },
      { $sample: { size: actualCount } },
      {
        $project: {
          word: 1,
          definition: 1,
          partOfSpeech: 1,
          usageCount: 1,
          createdAt: 1,
          // Include user info only if getting words from all users
          ...(includeAll && {
            userId: 1
          })
        }
      }
    ]);

    // If including all users, populate user info
    if (includeAll) {
      await Word.populate(words, {
        path: 'userId',
        select: 'username'
      });
    }

    res.status(200).json({
      success: true,
      words,
      requested: count,
      returned: words.length,
      totalAvailable: totalWords
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching random words'
    });
  }
};

// @desc    Get word statistics
// @route   GET /api/words/stats
// @access  Private
exports.getWordStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await Word.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalWords: { $sum: 1 },
          totalUsage: { $sum: '$usageCount' },
          avgUsage: { $avg: '$usageCount' },
          mostUsedWord: {
            $max: {
              word: '$word',
              count: '$usageCount'
            }
          }
        }
      }
    ]);

    // Get words by part of speech
    const partOfSpeechStats = await Word.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      { $match: { partOfSpeech: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$partOfSpeech',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = stats[0] || {
      totalWords: 0,
      totalUsage: 0,
      avgUsage: 0,
      mostUsedWord: null
    };

    res.status(200).json({
      success: true,
      stats: {
        ...result,
        partOfSpeech: partOfSpeechStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching word statistics'
    });
  }
}; 