const SentenceCheck = require('../models/SentenceCheck');
const aiService = require('../services/aiService');
const Joi = require('joi');
const mongoose = require('mongoose');
const User = require('../models/User');

// Validation schemas
const checkSentenceSchema = Joi.object({
  sentence: Joi.string().min(1).max(800).required(),
  isPublic: Joi.boolean().default(true),
  maxRetries: Joi.number().integer().min(1).max(10).default(3),
  grammarLanguage: Joi.string().valid('combined', 'pure').default('combined')
});

const publicChecksSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  sortBy: Joi.string().valid('recent', 'liked', 'trending').default('recent')
});

// @desc    Check sentence with AI
// @route   POST /api/check
// @access  Private
exports.checkSentence = async (req, res) => {
  try {
    // Validate input
    const { error } = checkSentenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { sentence, isPublic, maxRetries, grammarLanguage } = req.body;

    // Get user's grammar explanation language preference (fallback to request body or default)
    const user = await User.findById(req.user.id).select('preferences.grammarExplanationLanguage');
    const grammarLanguageOption = grammarLanguage || user?.preferences?.grammarExplanationLanguage || 'combined';

    // Check sentence using AI
    let aiResult;
    try {
      aiResult = await aiService.checkSentence(sentence, req.user.id, maxRetries, grammarLanguageOption, req.locale);
    } catch (aiError) {
      return res.status(500).json({
        success: false,
        message: req.t('ai.checkFailed', { message: aiError.message }),
        retryInfo: aiError.retryInfo || null
      });
    }

    // Save sentence check to database
    const sentenceCheck = await SentenceCheck.create({
      userId: req.user.id,
      originalSentence: sentence.trim(),
      grammarAnalysis: aiResult.grammarAnalysis,
      grammarCorrection: aiResult.grammarCorrection,
      keywordAnalysis: aiResult.keywordAnalysis,
      chineseDefinition: aiResult.chineseDefinition,
      thinkingText: aiResult.thinking,
      isPublic: isPublic !== false,
      aiModel: aiResult.aiModel || 'Qwen/QwQ-32B',
      grammarLanguageOption: grammarLanguageOption
    });

    // Populate user info for response
    await sentenceCheck.populate('userId', 'username');

    res.status(201).json({
      success: true,
      sentenceCheck,
      retryInfo: aiResult.retryInfo || null
    });
  } catch (error) {
    console.error('Sentence check error:', error);
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorCheckingSentence')
    });
  }
};

// @desc    Get user's sentence checks
// @route   GET /api/checks
// @access  Private
exports.getUserSentenceChecks = async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    // Build sort criteria
    let sortCriteria;
    switch (sortBy) {
      case 'liked':
        sortCriteria = { likeCount: -1, createdAt: -1 };
        break;
      default:
        sortCriteria = { createdAt: -1 };
    }

    // Get sentence checks
    const sentenceChecks = await SentenceCheck.find({ userId: req.user.id })
      .populate('userId', 'username')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await SentenceCheck.countDocuments({ userId: req.user.id });

    res.status(200).json({
      success: true,
      sentenceChecks,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + sentenceChecks.length < total,
        totalChecks: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorFetchingChecks')
    });
  }
};

// @desc    Get public sentence checks feed
// @route   GET /api/checks/public
// @access  Public (NO AUTHENTICATION REQUIRED)
exports.getPublicSentenceChecks = async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = publicChecksSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { page, limit, sortBy } = value;
    const skip = (page - 1) * limit;

    // Build aggregation pipeline for public sentence checks
    let aggregatePipeline = [
      { $match: { isPublic: true } }
    ];

    // Add sorting logic
    switch (sortBy) {
      case 'liked':
        aggregatePipeline.push({ $sort: { likeCount: -1, createdAt: -1 } });
        break;
      case 'trending':
        // Enhanced trending algorithm with recency boost
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        aggregatePipeline.push({
          $addFields: {
            trendingScore: {
              $add: [
                { $multiply: ['$likeCount', 10] }, // Weight likes heavily
                {
                  $cond: [
                    { $gte: ['$createdAt', oneDayAgo] },
                    5, // Boost for recent posts
                    0
                  ]
                }
              ]
            }
          }
        });
        aggregatePipeline.push({ $sort: { trendingScore: -1, createdAt: -1 } });
        break;
      default:
        aggregatePipeline.push({ $sort: { createdAt: -1 } });
    }

    // Add pagination
    aggregatePipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    // Add user lookup
    aggregatePipeline.push({
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
        pipeline: [
          { $project: { username: 1 } }
        ]
      }
    });

    // Transform user field
    aggregatePipeline.push({
      $addFields: {
        userId: { $arrayElemAt: ['$user', 0] }
      }
    });

    // Remove temporary fields
    aggregatePipeline.push({
      $unset: ['user', 'trendingScore']
    });

    // Execute aggregation
    const sentenceChecks = await SentenceCheck.aggregate(aggregatePipeline);

    // Get total count for pagination
    const total = await SentenceCheck.countDocuments({ isPublic: true });

    res.status(200).json({
      success: true,
      sentenceChecks,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + sentenceChecks.length < total,
        totalChecks: total
      }
    });
  } catch (error) {
    console.error('Public sentence checks error:', error);
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorFetchingChecks')
    });
  }
};

// @desc    Get single sentence check
// @route   GET /api/checks/:id
// @access  Public (NO AUTHENTICATION REQUIRED for public checks)
exports.getSentenceCheck = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find public sentence check or user's own check if authenticated
    let query = { _id: id };
    
    // If user is authenticated, they can see their own private checks
    if (req.user) {
      query = {
        _id: id,
        $or: [
          { isPublic: true },
          { userId: req.user.id }
        ]
      };
    } else {
      // If not authenticated, only show public checks
      query.isPublic = true;
    }

    const sentenceCheck = await SentenceCheck.findOne(query)
      .populate('userId', 'username');

    if (!sentenceCheck) {
      return res.status(404).json({
        success: false,
        message: req.t('sentenceCheck.checkNotFound')
      });
    }

    res.status(200).json({
      success: true,
      sentenceCheck
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorFetchingChecks')
    });
  }
};

// @desc    Toggle like on sentence check
// @route   POST /api/checks/:id/like
// @access  Private (AUTHENTICATION REQUIRED)
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find public sentence check (can only like public checks)
    const sentenceCheck = await SentenceCheck.findOne({ 
      _id: id, 
      isPublic: true 
    });

    if (!sentenceCheck) {
      return res.status(404).json({
        success: false,
        message: req.t('sentenceCheck.checkNotFound')
      });
    }

    const userId = req.user.id;
    const existingLikeIndex = sentenceCheck.likes.findIndex(
      like => like.userId.toString() === userId
    );

    if (existingLikeIndex > -1) {
      // Remove like
      sentenceCheck.likes.splice(existingLikeIndex, 1);
      sentenceCheck.likeCount = Math.max(0, sentenceCheck.likeCount - 1);
      await sentenceCheck.save();

      res.status(200).json({
        success: true,
        message: req.t('sentenceCheck.unlikedSuccessfully'),
        liked: false,
        likeCount: sentenceCheck.likeCount
      });
    } else {
      // Add like
      sentenceCheck.likes.push({ userId });
      sentenceCheck.likeCount += 1;
      await sentenceCheck.save();

      res.status(200).json({
        success: true,
        message: req.t('sentenceCheck.likedSuccessfully'),
        liked: true,
        likeCount: sentenceCheck.likeCount
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorLikingCheck')
    });
  }
};

// @desc    Update sentence check privacy
// @route   PUT /api/checks/:id/privacy
// @access  Private
exports.updateSentenceCheckPrivacy = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;

    // Validate input
    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find user's sentence check
    const sentenceCheck = await SentenceCheck.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!sentenceCheck) {
      return res.status(404).json({
        success: false,
        message: req.t('sentenceCheck.checkNotFound')
      });
    }

    // Update privacy setting
    sentenceCheck.isPublic = isPublic;
    await sentenceCheck.save();

    res.status(200).json({
      success: true,
      sentenceCheck
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorUpdatingCheck')
    });
  }
};

// @desc    Delete sentence check
// @route   DELETE /api/checks/:id
// @access  Private
exports.deleteSentenceCheck = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find and delete user's sentence check
    const sentenceCheck = await SentenceCheck.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!sentenceCheck) {
      return res.status(404).json({
        success: false,
        message: req.t('sentenceCheck.checkNotFound')
      });
    }

    res.status(200).json({
      success: true,
      message: req.t('sentenceCheck.checkDeletedSuccessfully')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorDeletingCheck')
    });
  }
};

// @desc    Get public statistics for sentence checks
// @route   GET /api/checks/public/stats
// @access  Public (NO AUTHENTICATION REQUIRED)
exports.getPublicStatistics = async (req, res) => {
  try {
    // Aggregate statistics for public sentence checks
    const statisticsQuery = [
      {
        $match: { isPublic: true }
      },
      {
        $group: {
          _id: null,
          totalChecks: { $sum: 1 },
          totalLikes: { $sum: '$likeCount' },
          avgSentenceLength: { $avg: { $strLenCP: '$originalSentence' } }
        }
      }
    ];

    const [statistics] = await SentenceCheck.aggregate(statisticsQuery);

    // If no public checks exist, return zero stats
    const stats = statistics || {
      totalChecks: 0,
      totalLikes: 0,
      avgSentenceLength: 0
    };

    res.status(200).json({
      success: true,
      statistics: {
        totalChecks: stats.totalChecks,
        totalLikes: stats.totalLikes,
        avgSentenceLength: Math.round(stats.avgSentenceLength || 0)
      }
    });
  } catch (error) {
    console.error('Public sentence check statistics error:', error);
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorGettingStats')
    });
  }
};

// @desc    Delete all user's sentence checks
// @route   DELETE /api/checks/all
// @access  Private
exports.deleteAllSentenceChecks = async (req, res) => {
  try {
    // Delete all sentence checks for the authenticated user
    const result = await SentenceCheck.deleteMany({
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: req.t('sentenceCheck.allChecksDeletedSuccessfully'),
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all sentence checks error:', error);
    res.status(500).json({
      success: false,
      message: req.t('sentenceCheck.serverErrorDeletingAllChecks')
    });
  }
}; 