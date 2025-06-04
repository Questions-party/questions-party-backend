require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/english-learning',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_key',
  // SiliconFlow AI configuration (default provider) with dynamic model selection
  siliconflowApiKey: process.env.SILICONFLOW_API_KEY,
  siliconflowApiUrl: process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1/chat/completions',
  // Dynamic model configuration based on input complexity
  siliconflowModelLight: process.env.SILICONFLOW_MODEL_LIGHT || 'Qwen/Qwen3-8B',
  siliconflowModelMedium: process.env.SILICONFLOW_MODEL_MEDIUM || 'Qwen/Qwen3-14B', 
  siliconflowModelHeavy: process.env.SILICONFLOW_MODEL_HEAVY || 'Qwen/Qwen3-30B-A3B',
  // Legacy model for backward compatibility
  siliconflowModel: process.env.SILICONFLOW_MODEL || 'Qwen/QwQ-32B',
  // Keep OpenAI for backward compatibility (optional)
  openaiApiKey: process.env.OPENAI_API_KEY,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  rateLimitWindowMs: 2 * 60 * 1000, // 2 minutes
  rateLimitMax: 100, // limit each IP to 100 requests per windowMs
  rateLimitMaxPublic: 200, // higher limit for public content access
  aiRateLimitMax: 10, // limit AI requests to 10 per windowMs
  authRateLimitMax: 5, // limit auth attempts to 5 per windowMs
}; 