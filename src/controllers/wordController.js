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
      message: req.t('words.serverErrorFetchingWords')
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
        message: req.t('words.wordAlreadyExists')
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
        message: req.t('words.wordAlreadyExists')
      });
    }
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorAddingWord')
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
        message: req.t('words.wordNotFound')
      });
    }

    res.status(200).json({
      success: true,
      word
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorUpdatingWord')
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
        message: req.t('words.wordNotFound')
      });
    }

    res.status(200).json({
      success: true,
      message: req.t('words.wordDeletedSuccessfully')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorDeletingWord')
    });
  }
};

// @desc    Get word statistics
// @route   GET /api/words/stats
// @access  Private
exports.getWordStats = async (req, res) => {
  try {
    const totalWords = await Word.countDocuments({ userId: req.user.id });
    const totalUsage = await Word.aggregate([
      { $match: { userId: req.user.id } },
      { $group: { _id: null, totalUsage: { $sum: '$usageCount' } } }
    ]);

    const mostUsedWords = await Word.find({ userId: req.user.id })
      .sort({ usageCount: -1 })
      .limit(5)
      .select('word usageCount');

    res.status(200).json({
      success: true,
      stats: {
        totalWords,
        totalUsage: totalUsage[0]?.totalUsage || 0,
        mostUsedWords
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorGettingStats')
    });
  }
};

// @desc    Export user's words
// @route   GET /api/words/export
// @access  Private
exports.exportWords = async (req, res) => {
  try {
    const words = await Word.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('-userId -__v');

    res.status(200).json({
      success: true,
      words,
      exportDate: new Date().toISOString(),
      totalCount: words.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorExportingWords')
    });
  }
};

// @desc    Get random words from user's collection
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
    const query = { userId: req.user.id };

    // Get total count first
    const totalWords = await Word.countDocuments(query);
    
    if (totalWords === 0) {
      return res.status(200).json({
        success: true,
        words: [],
        totalAvailable: 0
      });
    }

    // Ensure count doesn't exceed available words
    const requestedCount = Math.min(count, totalWords);
    
    if (count > totalWords && !includeAll) {
      return res.status(400).json({
        success: false,
        message: req.t('words.randomWordsLimitExceeded')
      });
    }

    // Get random words using aggregation
    const words = await Word.aggregate([
      { $match: query },
      { $sample: { size: requestedCount } },
      { $project: { word: 1, definition: 1, partOfSpeech: 1, usageCount: 1 } }
    ]);

    res.status(200).json({
      success: true,
      words,
      totalAvailable: totalWords,
      requested: count,
      returned: words.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorRandomWords')
    });
  }
}; 