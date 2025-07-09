require('dotenv').config();

// Helper function to get decrypted platform API key
function getPlatformApiKey() {
    // Try to get encrypted platform API key first
    if (process.env.ENCRYPTED_PLATFORM_API_KEY) {
        try {
            const {decrypt} = require('../utils/rsaCrypto');

            if (process.env.ENCRYPTED_PLATFORM_API_KEY.startsWith('rsa:')) {
                const encryptedData = process.env.ENCRYPTED_PLATFORM_API_KEY.substring(4);
                return decrypt(encryptedData);
            }
        } catch (error) {
            console.warn('Failed to decrypt platform API key:', error.message);
        }
    }

    // return decrypted key if available, otherwise return null
    return null;
}

module.exports = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/english-learning',
    jwtSecret: process.env.JWT_SECRET || 'fallback_secret_key',
    // SiliconFlow AI configuration (default provider) with dynamic model selection
    siliconflowApiKey: getPlatformApiKey(),
    siliconflowApiUrl: process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1/chat/completions',
    // Dynamic model configuration based on input complexity
    siliconflowModelLight: process.env.SILICONFLOW_MODEL_LIGHT || 'Qwen/Qwen3-8B',
    siliconflowModelMedium: process.env.SILICONFLOW_MODEL_MEDIUM || 'Qwen/Qwen3-14B',
    siliconflowModelHeavy: process.env.SILICONFLOW_MODEL_HEAVY || 'Qwen/Qwen3-30B-A3B',
    // Legacy model for backward compatibility
    siliconflowModel: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B',
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4173',
    rateLimitWindowMs: 2 * 60 * 1000, // 2 minutes
    rateLimitMax: 100, // limit each IP to 100 requests per windowMs
    rateLimitMaxPublic: 200, // higher limit for public content access
    aiRateLimitMax: 10, // limit AI requests to 10 per windowMs
    authRateLimitMax: 20, // limit auth attempts to 5 per windowMs
    // Redis configuration
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
    },
    aliyun: {
        accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
    }
}; 