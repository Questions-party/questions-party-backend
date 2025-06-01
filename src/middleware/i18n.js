const i18n = require('../utils/i18n');

/**
 * Middleware to detect language and add translation functions to request
 */
const i18nMiddleware = (req, res, next) => {
  let locale = i18n.defaultLocale;

  // 1. Check for explicit locale in query parameter (for testing/debugging)
  if (req.query.lang && i18n.isSupported(req.query.lang)) {
    locale = req.query.lang;
  }
  // 2. Check user preferences (if authenticated)
  else if (req.user && req.user.preferences && req.user.preferences.language) {
    locale = req.user.preferences.language;
  }
  // 3. Check custom language header
  else if (req.headers['x-language'] && i18n.isSupported(req.headers['x-language'])) {
    locale = req.headers['x-language'];
  }
  // 4. Detect from Accept-Language header
  else if (req.headers['accept-language']) {
    locale = i18n.detectLocale(req.headers['accept-language']);
  }

  // Add locale to request object
  req.locale = locale;

  // Add translation function to request
  req.t = (key, params = {}) => i18n.t(key, locale, params);

  // Add helper for response messages
  req.responseMessage = (key, params = {}) => {
    return {
      message: i18n.t(key, locale, params),
      messageKey: key
    };
  };

  next();
};

/**
 * Helper function to create standardized API responses with localized messages
 */
const createResponse = (req, success, statusCode, messageKey, data = {}, params = {}) => {
  const response = {
    success,
    ...req.responseMessage(messageKey, params),
    ...data
  };

  return response;
};

/**
 * Helper function to create error responses with localized messages
 */
const createErrorResponse = (req, statusCode, messageKey, params = {}) => {
  return createResponse(req, false, statusCode, messageKey, {}, params);
};

/**
 * Helper function to create success responses with localized messages
 */
const createSuccessResponse = (req, statusCode, messageKey, data = {}, params = {}) => {
  return createResponse(req, true, statusCode, messageKey, data, params);
};

module.exports = {
  i18nMiddleware,
  createResponse,
  createErrorResponse,
  createSuccessResponse
}; 