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

        // Response format configuration
        this.responseFormat = {
            sentenceMarker: "SENTENCE:",
            grammarMarker: "GRAMMAR_ANALYSIS:",
            chineseMarker: "CHINESE_TRANSLATION:",
            endMarker: "END_FORMAT"
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
     * @param {number} maxRetries - Maximum retry attempts (default: 3)
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @returns {Object} Generated sentence and explanation with retry info
     */
    async generateSentence(words, userId = null, conversationHistory = [], maxRetries = 3, grammarLanguageOption = 'combined') {
        // Validate words first
        const cleanedWords = this.validateWords(words);

        // Get configuration for user
        const aiConfig = await this.getConfigurationForUser(userId);

        if (!aiConfig.apiKey) {
            throw new Error('No API key available. Please contact administrator or provide your own API key.');
        }

        let attempt = 0;
        let lastError = null;

        while (attempt < maxRetries) {
            attempt++;
            
            try {
                // Create structured prompt for consistent output format
                const prompt = this.createStructuredPrompt(cleanedWords, grammarLanguageOption);

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

                // Parse the structured response
                const parsedResponse = this.parseStructuredResponse(content);

                if (parsedResponse.isValid) {
                    return {
                        sentence: parsedResponse.sentence,
                        explanation: parsedResponse.grammarAnalysis,
                        chineseTranslation: parsedResponse.chineseTranslation,
                        aiModel: aiConfig.model,
                        thinking: thinking,
                        rawResponse: response.data,
                        retryInfo: {
                            attempt: attempt,
                            maxRetries: maxRetries,
                            success: true
                        }
                    };
                } else {
                    // Invalid format, will retry if attempts remaining
                    lastError = new Error(`Invalid response format on attempt ${attempt}: ${parsedResponse.error}`);
                    if (attempt >= maxRetries) {
                        throw lastError;
                    }
                    continue;
                }

            } catch (error) {
                lastError = error;
                
                // Only retry for format errors, not for API errors
                if (error.response?.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again later.');
                } else if (error.response?.status === 401) {
                    throw new Error('Invalid API key or authentication failed.');
                } else if (error.code === 'ECONNABORTED') {
                    throw new Error('Request timeout. Please try again.');
                } else if (error.response?.status === 400) {
                    throw new Error('Invalid request to AI API');
                } else if (error.message.includes('Invalid response format')) {
                    // Format error - continue retrying
                    if (attempt >= maxRetries) {
                        throw new Error(`Failed to get valid response format after ${maxRetries} attempts. Last error: ${error.message}`);
                    }
                    continue;
                } else {
                    // Other errors - don't retry
                    throw new Error(`AI service error: ${error.message}`);
                }
            }
        }

        // If we get here, all retries failed
        throw lastError || new Error(`Failed to generate sentence after ${maxRetries} attempts`);
    }

    /**
     * Create structured prompt with specific format requirements
     * @param {Array} cleanedWords - Array of cleaned words
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @returns {string} Structured prompt
     */
    createStructuredPrompt(cleanedWords, grammarLanguageOption) {
        if (grammarLanguageOption === 'combined') {
            // Combined Chinese and English explanation (default)
            return `You are an English language tutor. Create a single natural sentence that incorporates ALL of the following words: ${cleanedWords.join(', ')}

IMPORTANT: You MUST follow this EXACT output format:

SENTENCE:
[Write a single, grammatically correct sentence using ALL the provided words naturally]

GRAMMAR_ANALYSIS:
[Provide detailed grammar explanation covering:
1. Sentence structure (subject, predicate, objects, etc.)
2. How each word functions in the sentence
3. Grammar rules demonstrated
4. Educational insights about word usage

Please provide the explanation in both English and Chinese for better understanding, with key grammar terms explained in both languages.]

CHINESE_TRANSLATION:
[Provide a natural and accurate Chinese translation of the sentence, maintaining the meaning and context]

END_FORMAT

Requirements:
- Use ALL provided words: ${cleanedWords.join(', ')}
- The sentence must be natural and meaningful
- Grammar analysis must be detailed and educational, provided in both English and Chinese
- Chinese translation must be accurate and natural
- Follow the exact format above with the markers

Words to include: ${cleanedWords.join(', ')}`;
        } else {
            // Pure English explanation
            return `You are an English language tutor. Create a single natural sentence that incorporates ALL of the following words: ${cleanedWords.join(', ')}

IMPORTANT: You MUST follow this EXACT output format:

SENTENCE:
[Write a single, grammatically correct sentence using ALL the provided words naturally]

GRAMMAR_ANALYSIS:
[Provide detailed grammar explanation covering:
1. Sentence structure (subject, predicate, objects, etc.)
2. How each word functions in the sentence
3. Grammar rules demonstrated
4. Educational insights about word usage

Please provide the explanation in clear, comprehensive English only.]

CHINESE_TRANSLATION:
[Provide a natural and accurate Chinese translation of the sentence, maintaining the meaning and context]

END_FORMAT

Requirements:
- Use ALL provided words: ${cleanedWords.join(', ')}
- The sentence must be natural and meaningful
- Grammar analysis must be detailed and educational, provided in English only
- Chinese translation must be accurate and natural
- Follow the exact format above with the markers

Words to include: ${cleanedWords.join(', ')}`;
        }
    }

    /**
     * Parse structured AI response to extract sentence and grammar analysis
     * @param {string} content - AI response content
     * @returns {Object} Parsed response with validation
     */
    parseStructuredResponse(content) {
        try {
            const { sentenceMarker, grammarMarker, chineseMarker, endMarker } = this.responseFormat;
            
            // Check if all required markers are present
            if (!content.includes(sentenceMarker) || !content.includes(grammarMarker) || !content.includes(chineseMarker)) {
                return {
                    isValid: false,
                    error: `Missing required format markers. Expected: ${sentenceMarker}, ${grammarMarker}, and ${chineseMarker}`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            // Extract sentence section
            const sentenceStart = content.indexOf(sentenceMarker) + sentenceMarker.length;
            const grammarStart = content.indexOf(grammarMarker);
            
            if (sentenceStart >= grammarStart) {
                return {
                    isValid: false,
                    error: 'Invalid marker order. SENTENCE must come before GRAMMAR_ANALYSIS',
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            const sentenceSection = content.substring(sentenceStart, grammarStart).trim();
            
            // Extract grammar analysis section
            const grammarAnalysisStart = content.indexOf(grammarMarker) + grammarMarker.length;
            const chineseTranslationStart = content.indexOf(chineseMarker) + chineseMarker.length;
            const endFormatIndex = content.indexOf(endMarker);
            
            let grammarSection;
            let chineseTranslationSection;
            if (endFormatIndex !== -1) {
                grammarSection = content.substring(grammarAnalysisStart, content.indexOf(chineseMarker)).trim();
                chineseTranslationSection = content.substring(chineseTranslationStart, endFormatIndex).trim();
            } else {
                grammarSection = content.substring(grammarAnalysisStart, content.indexOf(chineseMarker)).trim();
                chineseTranslationSection = content.substring(chineseTranslationStart).trim();
            }

            // Validate extracted content
            if (!sentenceSection || sentenceSection.length < 10) {
                return {
                    isValid: false,
                    error: 'Sentence section is too short or empty',
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            if (!grammarSection || grammarSection.length < 20) {
                return {
                    isValid: false,
                    error: 'Grammar analysis section is too short or empty',
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            if (!chineseTranslationSection || chineseTranslationSection.length < 10) {
                return {
                    isValid: false,
                    error: 'Chinese translation section is too short or empty',
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            return {
                isValid: true,
                sentence: sentenceSection,
                grammarAnalysis: grammarSection,
                chineseTranslation: chineseTranslationSection,
                error: null
            };

        } catch (error) {
            return {
                isValid: false,
                error: `Parse error: ${error.message}`,
                sentence: '',
                grammarAnalysis: '',
                chineseTranslation: ''
            };
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