const Generation = require('../models/Generation');
const Word = require('../models/Word');
const aiService = require('../services/aiService');
const Joi = require('joi');
const mongoose = require('mongoose');

// Validation schemas
const generateSentenceSchema = Joi.object({
  words: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(20).required(),
  isPublic: Joi.boolean().default(true),
  maxRetries: Joi.number().integer().min(1).max(10).default(3)
});

const publicGenerationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  sortBy: Joi.string().valid('recent', 'liked', 'trending').default('recent')
});

// @desc    Generate sentence with AI
// @route   POST /api/generate
// @access  Private
exports.generateSentence = async (req, res) => {
  try {
    // Validate input
    const { error } = generateSentenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { words, isPublic, maxRetries } = req.body;

    // Generate sentence using AI with the Java-inspired service
    let aiResult;
    try {
      aiResult = await aiService.generateSentence(words, req.user.id, [], maxRetries);
    } catch (aiError) {
      return res.status(500).json({
        success: false,
        message: req.t('ai.generationFailed', { message: aiError.message }),
        retryInfo: aiError.retryInfo || null
      });
    }

    // Save generation to database
    const generation = await Generation.create({
      userId: req.user.id,
      words: words.map(word => word.trim().toLowerCase()),
      sentence: aiResult.sentence,
      explanation: aiResult.explanation,
      thinkingText: aiResult.thinking, // Support for QwQ reasoning
      isPublic: isPublic !== false, // default to true if not specified
      aiModel: aiResult.aiModel || 'Qwen/QwQ-32B'
    });

    // Update word usage counts for user's words
    await Word.updateMany(
      { 
        word: { $in: words.map(w => w.trim().toLowerCase()) }, 
        userIds: req.user.id 
      },
      { $inc: { usageCount: 1 } }
    );

    // Populate user info for response
    await generation.populate('userId', 'username');

    res.status(201).json({
      success: true,
      generation,
      retryInfo: aiResult.retryInfo || null
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorGeneratingSentence')
    });
  }
};

// @desc    Get user's generations
// @route   GET /api/generations
// @access  Private
exports.getUserGenerations = async (req, res) => {
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

    // Get generations
    const generations = await Generation.find({ userId: req.user.id })
      .populate('userId', 'username')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Generation.countDocuments({ userId: req.user.id });

    res.status(200).json({
      success: true,
      generations,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + generations.length < total,
        totalGenerations: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorFetchingGenerations')
    });
  }
};

// @desc    Get public generations feed
// @route   GET /api/generations/public
// @access  Public (NO AUTHENTICATION REQUIRED)
exports.getPublicGenerations = async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = publicGenerationsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { page, limit, sortBy } = value;
    const skip = (page - 1) * limit;

    // Build aggregation pipeline for public generations
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
    const generations = await Generation.aggregate(aggregatePipeline);

    // Get total count for pagination
    const total = await Generation.countDocuments({ isPublic: true });

    res.status(200).json({
      success: true,
      generations,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + generations.length < total,
        totalGenerations: total
      }
    });
  } catch (error) {
    console.error('Public generations error:', error);
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorFetchingGenerations')
    });
  }
};

// @desc    Get single generation
// @route   GET /api/generations/:id
// @access  Public (NO AUTHENTICATION REQUIRED for public generations)
exports.getGeneration = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find public generation or user's own generation if authenticated
    let query = { _id: id };
    
    // If user is authenticated, they can see their own private generations
    if (req.user) {
      query = {
        _id: id,
        $or: [
          { isPublic: true },
          { userId: req.user.id }
        ]
      };
    } else {
      // If not authenticated, only show public generations
      query.isPublic = true;
    }

    const generation = await Generation.findOne(query)
      .populate('userId', 'username');

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: req.t('generations.generationNotFound')
      });
    }

    res.status(200).json({
      success: true,
      generation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorFetchingGenerations')
    });
  }
};

// @desc    Toggle like on generation
// @route   POST /api/generations/:id/like
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

    // Find public generation (can only like public generations)
    const generation = await Generation.findOne({ 
      _id: id, 
      isPublic: true 
    });

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: req.t('generations.generationNotFound')
      });
    }

    const userId = req.user.id;
    const existingLikeIndex = generation.likes.findIndex(
      like => like.userId.toString() === userId
    );

    if (existingLikeIndex > -1) {
      // Remove like
      generation.likes.splice(existingLikeIndex, 1);
      generation.likeCount = Math.max(0, generation.likeCount - 1);
      await generation.save();

      res.status(200).json({
        success: true,
        message: req.t('generations.unlikedSuccessfully'),
        liked: false,
        likeCount: generation.likeCount
      });
    } else {
      // Add like
      generation.likes.push({ userId });
      generation.likeCount += 1;
      await generation.save();

      res.status(200).json({
        success: true,
        message: req.t('generations.likedSuccessfully'),
        liked: true,
        likeCount: generation.likeCount
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorLikingGeneration')
    });
  }
};

// @desc    Update generation privacy
// @route   PUT /api/generations/:id/privacy
// @access  Private
exports.updateGenerationPrivacy = async (req, res) => {
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

    // Find user's generation
    const generation = await Generation.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: req.t('generations.generationNotFound')
      });
    }

    // Update privacy setting
    generation.isPublic = isPublic;
    await generation.save();

    res.status(200).json({
      success: true,
      generation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorUpdatingGeneration')
    });
  }
};

// @desc    Delete generation
// @route   DELETE /api/generations/:id
// @access  Private
exports.deleteGeneration = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: req.t('common.badRequest')
      });
    }

    // Find and delete user's generation
    const generation = await Generation.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: req.t('generations.generationNotFound')
      });
    }

    res.status(200).json({
      success: true,
      message: req.t('generations.generationDeletedSuccessfully')
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorDeletingGeneration')
    });
  }
};

// @desc    Get public statistics
// @route   GET /api/generations/public/stats
// @access  Public (NO AUTHENTICATION REQUIRED)
exports.getPublicStatistics = async (req, res) => {
  try {
    // Aggregate statistics for public generations
    const statisticsQuery = [
      {
        $match: { isPublic: true }
      },
      {
        $group: {
          _id: null,
          totalGenerations: { $sum: 1 },
          totalLikes: { $sum: '$likeCount' },
          totalWords: { $sum: { $size: '$words' } }
        }
      }
    ];

    const [statistics] = await Generation.aggregate(statisticsQuery);

    // If no public generations exist, return zero stats
    const stats = statistics || {
      totalGenerations: 0,
      totalLikes: 0,
      totalWords: 0
    };

    res.status(200).json({
      success: true,
      statistics: {
        totalGenerations: stats.totalGenerations,
        totalWords: stats.totalWords,
        totalLikes: stats.totalLikes
      }
    });
  } catch (error) {
    console.error('Public statistics error:', error);
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorGettingStats')
    });
  }
};

// @desc    Delete all user's generations
// @route   DELETE /api/generations/all
// @access  Private
exports.deleteAllGenerations = async (req, res) => {
  try {
    // Delete all generations for the authenticated user
    const result = await Generation.deleteMany({
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: req.t('generations.allGenerationsDeletedSuccessfully'),
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all generations error:', error);
    res.status(500).json({
      success: false,
      message: req.t('generations.serverErrorDeletingAllGenerations')
    });
  }
}; 