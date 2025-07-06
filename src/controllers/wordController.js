const Word = require('../models/Word');
const Joi = require('joi');
const { processWord } = require('../utils/wordUtils');

// Validation schemas
const addWordSchema = Joi.object({
  word: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\-']+$/).required(),
  forceAdd: Joi.boolean().default(false)
});

// @desc    Get user's words
// @route   GET /api/words
// @access  Private
exports.getUserWords = async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'recent', search, partOfSpeech } = req.query;
    const skip = (page - 1) * limit;

    // Build query - find words where user is in userIds array
    const query = { userIds: req.user.id };
    
    // Add search filter if provided
    if (search) {
      query.word = { $regex: search.trim(), $options: 'i' };
    }

    // Add part of speech filter if provided
    if (partOfSpeech && partOfSpeech !== 'all') {
      query.primaryPartOfSpeech = partOfSpeech;
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

    // Add translated part of speech to each word
    const wordsWithTranslation = words.map(word => {
      const wordObj = word.toObject();
      if (wordObj.primaryPartOfSpeech) {
        wordObj.primaryPartOfSpeechTranslated = req.t(`words.${wordObj.primaryPartOfSpeech}`);
      }
      return wordObj;
    });

    // Get total count for pagination
    const total = await Word.countDocuments(query);

    res.status(200).json({
      success: true,
      words: wordsWithTranslation,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + wordsWithTranslation.length < total,
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

    const { word, forceAdd } = req.body;
    const cleanWord = word.toLowerCase().trim();

    let wordProcessing;
    
    if (forceAdd) {
      // Skip spelling check and only get WordNet data
      const wordNetData = await require('../utils/wordUtils').getWordNetData(cleanWord);
      wordProcessing = {
        success: true,
        word: cleanWord,
        ...wordNetData
      };
    } else {
      // Process word (spell check and WordNet lookup)
      wordProcessing = await processWord(cleanWord);
      
      if (!wordProcessing.success) {
        // Return spelling suggestions with 200 status (not an error, just needs user confirmation)
        return res.status(200).json({
          success: false,
          needsConfirmation: true,
          spellingError: true,
          message: req.t('words.spellingError'),
          suggestions: wordProcessing.suggestions || [],
          originalWord: wordProcessing.word,
          suggestedCorrection: wordProcessing.suggestions && wordProcessing.suggestions.length > 0 ? wordProcessing.suggestions[0] : null
        });
      }
    }

    // Check if word already exists
    const existingWord = await Word.findOne({
      word: cleanWord
    });

    if (existingWord) {
      // Check if user already has this word
      if (existingWord.userIds.includes(req.user.id)) {
        return res.status(400).json({
          success: false,
          message: req.t('words.wordAlreadyExists')
        });
      }

      // Add user to existing word
      existingWord.userIds.push(req.user.id);
      await existingWord.save();

      // Add translated part of speech
      const wordObj = existingWord.toObject();
      if (wordObj.primaryPartOfSpeech) {
        wordObj.primaryPartOfSpeechTranslated = req.t(`words.${wordObj.primaryPartOfSpeech}`);
      }

      res.status(201).json({
        success: true,
        word: wordObj
      });
    } else {
      // Create new word with WordNet data
      const newWord = await Word.create({
        word: cleanWord,
        userIds: [req.user.id],
        definitions: wordProcessing.definitions || [],
        primaryDefinition: wordProcessing.primaryDefinition,
        primaryPartOfSpeech: wordProcessing.primaryPartOfSpeech,
        wordNetProcessed: wordProcessing.wordNetProcessed
      });

      // Add translated part of speech
      const wordObj = newWord.toObject();
      if (wordObj.primaryPartOfSpeech) {
        wordObj.primaryPartOfSpeechTranslated = req.t(`words.${wordObj.primaryPartOfSpeech}`);
      }

      res.status(201).json({
        success: true,
        word: wordObj
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: req.t('words.wordAlreadyExists')
      });
    }
    console.error('Add word error:', error);
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorAddingWord')
    });
  }
};

// @desc    Delete word
// @route   DELETE /api/words/:id
// @access  Private
exports.deleteWord = async (req, res) => {
  try {
    const word = await Word.findOne({
      _id: req.params.id,
      userIds: req.user.id
    });

    if (!word) {
      return res.status(404).json({
        success: false,
        message: req.t('words.wordNotFound')
      });
    }

    // If only one user has this word, delete the entire word
    if (word.userIds.length === 1) {
      await Word.findByIdAndDelete(req.params.id);
    } else {
      // Remove user from userIds array
      word.userIds = word.userIds.filter(userId => userId.toString() !== req.user.id);
      await word.save();
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
    const totalWords = await Word.countDocuments({ userIds: req.user.id });
    const totalUsage = await Word.aggregate([
      { $match: { userIds: req.user.id } },
      { $group: { _id: null, totalUsage: { $sum: '$usageCount' } } }
    ]);

    const mostUsedWords = await Word.find({ userIds: req.user.id })
      .sort({ usageCount: -1 })
      .limit(5)
      .select('word usageCount');

    // Get part of speech distribution
    const partOfSpeechStats = await Word.aggregate([
      { $match: { userIds: req.user.id, primaryPartOfSpeech: { $ne: null } } },
      { $group: { _id: '$primaryPartOfSpeech', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalWords,
        totalUsage: totalUsage[0]?.totalUsage || 0,
        mostUsedWords,
        partOfSpeechStats
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
    const words = await Word.find({ userIds: req.user.id })
      .sort({ createdAt: -1 })
      .select('-userIds -__v');

    // Add translated part of speech to each word
    const wordsWithTranslation = words.map(word => {
      const wordObj = word.toObject();
      if (wordObj.primaryPartOfSpeech) {
        wordObj.primaryPartOfSpeechTranslated = req.t(`words.${wordObj.primaryPartOfSpeech}`);
      }
      return wordObj;
    });

    res.status(200).json({
      success: true,
      words: wordsWithTranslation,
      exportDate: new Date().toISOString(),
      totalCount: wordsWithTranslation.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorExportingWords')
    });
  }
};

// @desc    Get random words from global collection
// @route   GET /api/words/random
// @access  Private
exports.getRandomWords = async (req, res) => {
  try {
    // Validate query parameters
    const randomWordsValidationSchema = Joi.object({
      count: Joi.number().integer().min(1).max(500).default(5),
      excludeUserWords: Joi.boolean().default(false),
      partOfSpeech: Joi.string().valid('noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun', 'determiner', 'adjective satellite')
    });

    const { error, value } = randomWordsValidationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { count, excludeUserWords, partOfSpeech } = value;

    // Build aggregation pipeline for random word selection
    let aggregationPipeline = [];

    // Build match criteria
    let matchCriteria = {};

    // If excludeUserWords is true, exclude words that the user already has
    if (excludeUserWords) {
      matchCriteria.userIds = { $ne: req.user.id };
    }

    // Filter by part of speech if specified
    if (partOfSpeech) {
      matchCriteria.primaryPartOfSpeech = partOfSpeech;
    }

    // Add match stage if there are criteria
    if (Object.keys(matchCriteria).length > 0) {
      aggregationPipeline.push({ $match: matchCriteria });
    }

    // Add random sampling stage
    aggregationPipeline.push({
      $sample: { size: count * 2 } // Get more than needed to account for potential filtering
    });

    // Project only the fields we need
    aggregationPipeline.push({
      $project: {
        _id: 1,
        word: 1,
        primaryDefinition: 1,
        primaryPartOfSpeech: 1,
        usageCount: 1
      }
    });

    // Execute aggregation to get random words
    let randomWords = await Word.aggregate(aggregationPipeline);

    // If we didn't get enough words, try again without the user exclusion
    if (randomWords.length < count && excludeUserWords) {
      // Fallback: get random words from all words if not enough unique words
      const fallbackPipeline = [
        { $sample: { size: count } },
        {
          $project: {
            _id: 1,
            word: 1,
            primaryDefinition: 1,
            primaryPartOfSpeech: 1,
            usageCount: 1
          }
        }
      ];
      
      const fallbackWords = await Word.aggregate(fallbackPipeline);
      
      // Merge with existing results, avoiding duplicates
      const existingWordIds = new Set(randomWords.map(w => w._id.toString()));
      const newWords = fallbackWords.filter(w => !existingWordIds.has(w._id.toString()));
      
      randomWords = [...randomWords, ...newWords];
    }

    // Limit to requested count
    randomWords = randomWords.slice(0, count);

    // Get total available words count for response
    let totalAvailable;
    if (excludeUserWords) {
      totalAvailable = await Word.countDocuments({
        userIds: { $ne: req.user.id }
      });
    } else {
      totalAvailable = await Word.countDocuments({});
    }

    if (randomWords.length === 0) {
      return res.status(200).json({
        success: true,
        words: [],
        totalAvailable: totalAvailable,
        message: req.t('words.noAvailableWords')
      });
    }

    // Format words for consistency with frontend expectations
    const formattedWords = randomWords.map(word => ({
      _id: word._id,
      word: word.word,
      definition: word.primaryDefinition || '',
      partOfSpeech: word.primaryPartOfSpeech || '',
      partOfSpeechTranslated: word.primaryPartOfSpeech ? req.t(`words.${word.primaryPartOfSpeech}`) : '',
      usageCount: word.usageCount || 0
    }));

    res.status(200).json({
      success: true,
      words: formattedWords,
      totalAvailable: totalAvailable,
      requested: count,
      returned: formattedWords.length
    });
  } catch (error) {
    console.error('Random words error:', error);
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorRandomWords')
    });
  }
};

// @desc    Get available parts of speech
// @route   GET /api/words/parts-of-speech
// @access  Private
exports.getPartsOfSpeech = async (req, res) => {
  try {
    const partsOfSpeech = await Word.distinct('primaryPartOfSpeech', { 
      userIds: req.user.id,
      primaryPartOfSpeech: { $ne: null }
    });

    // Add translations for parts of speech
    const partsOfSpeechWithTranslations = partsOfSpeech.sort().map(pos => ({
      value: pos,
      label: req.t(`words.${pos}`),
      translation: req.t(`words.${pos}`)
    }));

    res.status(200).json({
      success: true,
      partsOfSpeech: partsOfSpeech.sort(),
      partsOfSpeechWithTranslations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('words.serverErrorGettingPartsOfSpeech')
    });
  }
}; 