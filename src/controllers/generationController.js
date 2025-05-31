const Generation = require('../models/Generation');
const Word = require('../models/Word');
const aiService = require('../services/aiService');
const Joi = require('joi');
const mongoose = require('mongoose');

// Validation schemas
const generateSentenceSchema = Joi.object({
  words: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(20).required(),
  isPublic: Joi.boolean().default(true)
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

    const { words, isPublic } = req.body;

    // Validate and clean words
    let cleanedWords;
    try {
      cleanedWords = aiService.validateWords(words);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

    // Generate sentence using AI
    let aiResult;
    try {
      aiResult = await aiService.generateSentence(cleanedWords);
    } catch (aiError) {
      return res.status(500).json({
        success: false,
        message: aiError.message
      });
    }

    // Save generation to database
    const generation = await Generation.create({
      userId: req.user.id,
      words: cleanedWords,
      sentence: aiResult.sentence,
      explanation: aiResult.explanation,
      isPublic: isPublic !== false // default to true if not specified
    });

    // Update word usage counts for user's words
    await Word.updateMany(
      { 
        word: { $in: cleanedWords }, 
        userId: req.user.id 
      },
      { $inc: { usageCount: 1 } }
    );

    // Populate user info for response
    await generation.populate('userId', 'username');

    res.status(201).json({
      success: true,
      generation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error generating sentence'
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
      message: 'Server error fetching generations'
    });
  }
};

// @desc    Get public generations feed
// @route   GET /api/generations/public
// @access  Public (with optional auth)
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

    // Build sort criteria
    let sortCriteria;
    let aggregatePipeline = [
      { $match: { isPublic: true } }
    ];

    switch (sortBy) {
      case 'liked':
        sortCriteria = { likeCount: -1, createdAt: -1 };
        break;
      case 'trending':
        // Trending algorithm: combine likes and recency
        aggregatePipeline.push({
          $addFields: {
            trendingScore: {
              $add: [
                { $multiply: ['$likeCount', 10] }, // Weight likes heavily
                {
                  $divide: [
                    { $subtract: [new Date(), '$createdAt'] },
                    86400000 // Convert to days
                  ]
                }
              ]
            }
          }
        });
        sortCriteria = { trendingScore: -1 };
        break;
      default:
        sortCriteria = { createdAt: -1 };
    }

    // Add sort, skip, limit to pipeline
    aggregatePipeline.push(
      { $sort: sortCriteria },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userId',
          pipeline: [
            { $project: { username: 1 } }
          ]
        }
      },
      {
        $unwind: '$userId'
      }
    );

    // Add user like status if authenticated
    if (req.user) {
      aggregatePipeline.push({
        $addFields: {
          isLikedByCurrentUser: {
            $in: [mongoose.Types.ObjectId(req.user.id), '$likes.userId']
          }
        }
      });
    }

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
    res.status(500).json({
      success: false,
      message: 'Server error fetching public generations'
    });
  }
};

// @desc    Toggle like on generation
// @route   POST /api/generations/:id/like
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid generation ID'
      });
    }

    const generation = await Generation.findById(id);
    
    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found'
      });
    }

    // Check if user has already liked this generation
    const likeIndex = generation.likes.findIndex(
      like => like.userId.toString() === userId
    );

    let isLiked;
    if (likeIndex > -1) {
      // Remove like
      generation.likes.splice(likeIndex, 1);
      generation.likeCount = Math.max(0, generation.likeCount - 1);
      isLiked = false;
    } else {
      // Add like
      generation.likes.push({ userId });
      generation.likeCount += 1;
      isLiked = true;
    }

    await generation.save();

    res.status(200).json({
      success: true,
      liked: isLiked,
      likeCount: generation.likeCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error toggling like'
    });
  }
};

// @desc    Get single generation
// @route   GET /api/generations/:id
// @access  Public (with optional auth)
exports.getGeneration = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid generation ID'
      });
    }

    let generation = await Generation.findById(id)
      .populate('userId', 'username');

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found'
      });
    }

    // Check if generation is public or belongs to current user
    if (!generation.isPublic && (!req.user || generation.userId._id.toString() !== req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add like status if user is authenticated
    let isLikedByCurrentUser = false;
    if (req.user) {
      isLikedByCurrentUser = generation.isLikedByUser(req.user.id);
    }

    res.status(200).json({
      success: true,
      generation: {
        ...generation.toObject(),
        isLikedByCurrentUser
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error fetching generation'
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
        message: 'Invalid generation ID'
      });
    }

    const generation = await Generation.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Generation deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error deleting generation'
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
        message: 'isPublic must be a boolean value'
      });
    }

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid generation ID'
      });
    }

    const generation = await Generation.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isPublic },
      { new: true }
    ).populate('userId', 'username');

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found'
      });
    }

    res.status(200).json({
      success: true,
      generation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error updating generation privacy'
    });
  }
}; 