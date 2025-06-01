require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const errorHandler = require('./src/middleware/errorHandler');
const {apiLimiter, publicContentLimiter, aiLimiter, authLimiter} = require('./src/middleware/rateLimiter');
const { i18nMiddleware } = require('./src/middleware/i18n');
const { optionalAuth } = require('./src/middleware/auth');
const i18n = require('./src/utils/i18n');
const config = require('./config/config');

// Connect to database
connectDB();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: config.frontendUrl,
    credentials: true
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));

// Internationalization middleware (must be early but after body parsing)
app.use(i18nMiddleware);

// Optional auth middleware for routes that might have authenticated users
// This allows i18n to access user language preferences
app.use(optionalAuth);

// Import routes
const authRoutes = require('./src/routes/auth');
const wordRoutes = require('./src/routes/words');
const generationRoutes = require('./src/routes/generations');
const aiConfigRoutes = require('./src/routes/aiConfigs');

// Mount auth routes with authentication rate limiting
app.use('/api/auth', authLimiter, authRoutes);

// Mount word routes with general API rate limiting (requires auth)
app.use('/api/words', apiLimiter, wordRoutes);

// Mount AI configuration routes with general API rate limiting (requires auth)
app.use('/api/ai-configs', apiLimiter, aiConfigRoutes);

// Mount generation routes with appropriate rate limiting
// AI generation route with strict rate limiting (requires auth)
app.use('/api/generate', aiLimiter, generationRoutes);

// Public generation routes with higher rate limits (no auth required)
app.use('/api/generations/public', publicContentLimiter);

// Other generation routes with general API rate limiting
app.use('/api/generations', apiLimiter, generationRoutes);

// Internationalization info endpoint
app.get('/api/i18n', (req, res) => {
    res.status(200).json({
        success: true,
        locale: req.locale,
        supportedLocales: i18n.getSupportedLocales(),
        defaultLocale: i18n.defaultLocale,
        detectedFromHeader: req.headers['accept-language'] ? 
            i18n.detectLocale(req.headers['accept-language']) : 
            i18n.defaultLocale
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: req.t('common.success'),
        timestamp: new Date().toISOString(),
        locale: req.locale,
        services: {
            database: 'connected',
            ai: 'SiliconFlow/Qwen available'
        }
    });
});

// Welcome route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to English Learning Website API',
        version: '1.0.0',
        documentation: '/api/health',
        locale: req.locale,
        features: {
            aiProvider: 'SiliconFlow',
            aiModel: 'Qwen/QwQ-32B',
            publicAccess: 'Available for viewing content',
            authRequired: 'For content creation and interaction'
        }
    });
});

// Catch 404 and forward to error handler
app.use('*', (req, res, next) => {
    const error = new Error(req.t('common.routeNotFound', { route: req.originalUrl }));
    error.statusCode = 404;
    next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = config.port;

app.listen(PORT, () => {
    console.log(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
    console.log(`AI Provider: SiliconFlow (${config.siliconflowModel})`);
    console.log(`Public content access: Enabled`);
    console.log(`Internationalization: English (en) and Chinese (zh) supported`);
});

module.exports = app;
