require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const errorHandler = require('./src/middleware/errorHandler');
const { apiLimiter, authLimiter, aiLimiter } = require('./src/middleware/rateLimiter');
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
app.use('/api/', apiLimiter);

// Import routes
const authRoutes = require('./src/routes/auth');
const wordRoutes = require('./src/routes/words');
const generationRoutes = require('./src/routes/generations');

// Mount routes with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/generate', aiLimiter, generationRoutes);
app.use('/api/generations', generationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to English Learning Website API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// Catch 404 and forward to error handler
app.use('*', (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
});

module.exports = app;
