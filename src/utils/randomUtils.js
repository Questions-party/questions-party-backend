const crypto = require('crypto');

/**
 * Generate a 6-digit verification code
 * @returns {string} 6-digit verification code
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a secure reset token
 * @returns {string} Secure reset token
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  generateVerificationCode,
  generateResetToken
};
