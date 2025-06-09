const rateLimit = require('express-rate-limit');
const config = require('../config/config');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public content rate limiter (higher limits for anonymous access)
const publicContentLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxPublic,
  message: {
    success: false,
    message: 'Too many requests for public content, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for AI generation
const aiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.aiRateLimitMax,
  message: {
    success: false,
    message: 'Too many AI generation requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiter
const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.authRateLimitMax,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

module.exports = {
  apiLimiter,
  publicContentLimiter,
  aiLimiter,
  authLimiter
}; 