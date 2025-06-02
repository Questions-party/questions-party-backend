const User = require('../models/User');
const Word = require('../models/Word');
const Generation = require('../models/Generation');

// @desc    Get global public statistics
// @route   GET /api/statistics
// @access  Public (NO AUTHENTICATION REQUIRED)
exports.getGlobalStatistics = async (req, res) => {
  try {
    // Get user count
    const totalUsers = await User.countDocuments({});

    // Get generation statistics
    const generationStats = await Generation.aggregate([
      {
        $match: { isPublic: true }
      },
      {
        $group: {
          _id: null,
          totalGenerations: { $sum: 1 },
          totalWords: { $sum: { $size: '$words' } }
        }
      }
    ]);

    // Get total unique words count
    const totalUniqueWords = await Word.countDocuments({});

    // If no statistics exist, provide defaults
    const genStats = generationStats[0] || {
      totalGenerations: 0,
      totalWords: 0
    };

    res.status(200).json({
      success: true,
      statistics: {
        totalUsers,
        totalGenerations: genStats.totalGenerations,
        totalWords: genStats.totalWords,
        totalUniqueWords
      }
    });
  } catch (error) {
    console.error('Global statistics error:', error);
    res.status(500).json({
      success: false,
      message: req.t('statistics.serverError')
    });
  }
}; 