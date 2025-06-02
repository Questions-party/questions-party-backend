const axios = require('axios');
const config = require('../../config/config');
const User = require('../models/User');
const HttpUtils = require('../utils/httpUtils');

class AIService {
    constructor() {
        // Platform-provided SiliconFlow configuration (immutable)
        this.platformConfig = {
            name: "SiliconFlow/Qwen Platform",
            apiUrl: config.siliconflowApiUrl || 'https://api.siliconflow.cn/v1/chat/completions',
            model: config.siliconflowModel || 'Qwen/QwQ-32B-Preview',
            apiKeyPlacement: "header",

            requestTemplate: {
                model: config.siliconflowModel || 'Qwen/QwQ-32B-Preview',
                messages: [], // Populated dynamically
                max_tokens: 512,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                stream: false,
                frequency_penalty: 0.5,
                response_format: {type: "text"}
            },

            // Dynamic path configurations
            requestMessageGroupPath: "messages",
            requestRolePathFromGroup: "role",
            requestTextPathFromGroup: "content",
            responseTextPath: "choices[0].message.content",
            responseThinkingTextPath: "choices[0].message.reasoning_content",

            // Role mappings
            requestUserRoleField: "user",
            requestAssistantField: "assistant",
            requestSystemField: "system",

            headers: {'Content-Type': 'application/json'},
            timeout: 30000
        };
    }

    /**
     * Get configuration for user (platform config + user's API key if provided)
     * @param {string} userId - User ID
     * @returns {Object} AI configuration object
     */
    async getConfigurationForUser(userId) {
        if (!userId) {
            // Use platform default API key for anonymous users
            return {
                ...this.platformConfig,
                apiKey: config.siliconflowApiKey
            };
        }

        // Get user's API key preference
        const user = await User.findById(userId).select('apiKey useCustomApiKey');

        if (user && user.useCustomApiKey && user.apiKey) {
            // User has custom API key - decrypt it for use
            const decryptedApiKey = user.getDecryptedApiKey();
            return {
                ...this.platformConfig,
                apiKey: decryptedApiKey
            };
        } else {
            // Use platform default API key
            return {
                ...this.platformConfig,
                apiKey: config.siliconflowApiKey
            };
        }
    }

    /**
     * Generate sentence using AI with platform configuration
     * @param {Array} words - Array of words to include
     * @param {string} userId - User ID (optional)
     * @param {Array} conversationHistory - Previous messages (optional)
     * @returns {Object} Generated sentence and explanation
     */
    async generateSentence(words, userId = null, conversationHistory = []) {
        // Validate words first
        const cleanedWords = this.validateWords(words);

        // Get configuration for user
        const aiConfig = await this.getConfigurationForUser(userId);

        if (!aiConfig.apiKey) {
            throw new Error('No API key available. Please contact administrator or provide your own API key.');
        }

        // Create prompt for SiliconFlow/Qwen
        const prompt = `You are an English language tutor using the Qwen/QwQ model. Create a single, natural sentence that incorporates ALL of the following words: ${cleanedWords.join(', ')}

Requirements:
1. Use ALL provided words naturally in the sentence
2. The sentence should be grammatically correct and meaningful
3. Provide detailed reasoning about your thought process and grammar explanation

Please generate a coherent sentence and explain your reasoning.

Words to include: ${cleanedWords.join(', ')}`;

        try {
            // Prepare request data using configuration
            const {headers, requestBody} = HttpUtils.prepareRequestData(
                aiConfig,
                prompt,
                conversationHistory
            );

            // Make HTTP request
            const response = await axios.post(aiConfig.apiUrl, requestBody, {
                headers,
                timeout: aiConfig.timeout
            });

            // Process response using configuration
            const {content, thinking} = HttpUtils.processAiResponse(
                JSON.stringify(response.data),
                aiConfig
            );

            return {
                sentence: content,
                explanation: thinking || 'Grammar explanation provided by AI',
                aiModel: aiConfig.model,
                thinking: thinking,
                rawResponse: response.data
            };
        } catch (error) {
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 401) {
                throw new Error('Invalid API key or authentication failed.');
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('Request timeout. Please try again.');
            } else if (error.response?.status === 400) {
                throw new Error('Invalid request to AI API');
            } else {
                throw new Error(`AI service error: ${error.message}`);
            }
        }
    }

    /**
     * Test user's API key with platform configuration
     * @param {string} apiKey - API key to test
     * @returns {Object} Test result
     */
    async testApiKey(apiKey) {
        try {
            // Create test configuration
            const testConfig = {
                ...this.platformConfig,
                apiKey: apiKey
            };

            // Prepare test request
            const testMessage = "Hello, this is a test message.";
            const {headers, requestBody} = HttpUtils.prepareRequestData(testConfig, testMessage);

            // Make test request
            const response = await axios.post(testConfig.apiUrl, requestBody, {
                headers,
                timeout: testConfig.timeout
            });

            // Process response
            const {content, thinking} = HttpUtils.processAiResponse(
                JSON.stringify(response.data),
                testConfig
            );

            return {
                success: true,
                message: "API key is valid and working",
                response: {
                    content: content,
                    thinking: thinking
                }
            };
        } catch (error) {
            return {
                success: false,
                message: "API key test failed",
                error: error.response?.data?.error?.message || error.message
            };
        }
    }

    /**
     * Get platform configuration info (without sensitive data)
     * @returns {Object} Platform configuration info
     */
    getPlatformConfigInfo() {
        return {
            provider: "SiliconFlow",
            model: this.platformConfig.model,
            apiUrl: this.platformConfig.apiUrl,
            features: [
                "Advanced reasoning with QwQ model",
                "Grammar explanations",
                "Natural sentence generation",
                "Multi-word integration"
            ]
        };
    }

    /**
     * Validate words array
     * @param {Array} words - Array of words to validate
     * @returns {Array} Cleaned words array
     */
    validateWords(words) {
        if (!Array.isArray(words)) {
            throw new Error('Words must be an array');
        }

        if (words.length === 0) {
            throw new Error('At least one word is required');
        }

        if (words.length > 20) {
            throw new Error('Maximum 20 words allowed per generation');
        }

        // Check for valid words (no empty strings, reasonable length)
        for (const word of words) {
            if (typeof word !== 'string' || word.trim().length === 0) {
                throw new Error('All words must be non-empty strings');
            }

            if (word.trim().length > 50) {
                throw new Error('Words must be 50 characters or less');
            }

            // Basic validation for English words (letters, hyphens, apostrophes)
            if (!/^[a-zA-Z\-']+$/.test(word.trim())) {
                throw new Error(`Invalid word format: ${word}`);
            }
        }

        return words.map(word => word.trim().toLowerCase());
    }
}

module.exports = new AIService(); 