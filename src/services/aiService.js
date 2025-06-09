const axios = require('axios');
const config = require('../config/config');
const User = require('../models/User');
const HttpUtils = require('../utils/httpUtils');
const i18n = require('../utils/i18n');
const promptLoader = require('../utils/promptLoader');

class AIService {
    constructor() {
        // Platform-provided SiliconFlow configuration (immutable)
        this.platformConfig = {
            name: "SiliconFlow/Qwen Platform",
            apiUrl: config.siliconflowApiUrl || 'https://api.siliconflow.cn/v1/chat/completions',
            model: config.siliconflowModel || 'Qwen/Qwen3-8B',
            apiKeyPlacement: "header",

            requestTemplate: {
                model: config.siliconflowModel || 'Qwen/Qwen3-8B',
                messages: [], // Populated dynamically
                max_tokens: 512,
                enable_thinking: false,
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
            timeout: 180000
        };

        // Dynamic model configuration thresholds
        this.modelThresholds = {
            wordGeneration: {
                max: 50,
                lightThreshold: Math.floor(50 / 3), // ~16 words
                mediumThreshold: Math.floor(50 * 2 / 3) // ~33 words
            },
            sentenceCheck: {
                max: 800,
                lightThreshold: Math.floor(800 / 3), // ~266 characters
                mediumThreshold: Math.floor(800 * 2 / 3) // ~533 characters
            }
        };

        // Response format configuration for generation
        this.responseFormat = {
            sentenceMarker: "SENTENCE:",
            grammarMarker: "GRAMMAR_ANALYSIS:",
            chineseMarker: "CHINESE_TRANSLATION:",
            endMarker: "END_FORMAT"
        };

        // Response format configuration for sentence checking
        this.checkResponseFormat = {
            grammarAnalysisMarker: "GRAMMAR_ANALYSIS:",
            grammarCorrectionMarker: "GRAMMAR_CORRECTION:",
            keywordAnalysisMarker: "KEYWORD_ANALYSIS:",
            chineseDefinitionMarker: "CHINESE_DEFINITION:",
            endMarker: "END_FORMAT"
        };
    }

    /**
     * Dynamically select AI model based on input complexity
     * @param {string} type - Type of operation ('wordGeneration' or 'sentenceCheck')
     * @param {number} inputSize - Size of input (word count or character count)
     * @returns {string} Selected model name
     */
    selectModelByComplexity(type, inputSize) {
        const thresholds = this.modelThresholds[type];

        if (!thresholds) {
            console.warn(`Unknown operation type: ${type}, using default model`);
            return config.siliconflowModel || 'Qwen/Qwen3-8B';
        }

        if (inputSize < thresholds.lightThreshold) {
            return config.siliconflowModelLight || 'Qwen/Qwen3-8B';
        } else if (inputSize < thresholds.mediumThreshold) {
            return config.siliconflowModelMedium || 'Qwen/Qwen3-14B';
        } else {
            return config.siliconflowModelHeavy || 'Qwen/Qwen3-30B-A3B';
        }
    }

    /**
     * Get configuration for user (platform config + user's API key if provided)
     * @param {string} userId - User ID
     * @param {string} selectedModel - Dynamically selected model
     * @returns {Object} AI configuration object
     */
    async getConfigurationForUser(userId, selectedModel = null) {
        const modelToUse = selectedModel || this.platformConfig.model;

        if (!userId) {
            // Use platform default API key for anonymous users
            return {
                ...this.platformConfig,
                model: modelToUse,
                requestTemplate: {
                    ...this.platformConfig.requestTemplate,
                    model: modelToUse
                },
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
                model: modelToUse,
                requestTemplate: {
                    ...this.platformConfig.requestTemplate,
                    model: modelToUse
                },
                apiKey: decryptedApiKey
            };
        } else {
            // Use platform default API key
            return {
                ...this.platformConfig,
                model: modelToUse,
                requestTemplate: {
                    ...this.platformConfig.requestTemplate,
                    model: modelToUse
                },
                apiKey: config.siliconflowApiKey
            };
        }
    }

    /**
     * Check sentence using AI with platform configuration and dynamic model selection
     * @param {string} sentence - Sentence to check
     * @param {string} userId - User ID (optional)
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @param {string} locale - Locale for error messages (default: 'en')
     * @param {boolean} enableThinking - Whether to enable AI thinking process (default: false)
     * @returns {Object} Sentence check result
     */
    async checkSentence(sentence, userId = null, grammarLanguageOption = 'combined', locale = 'en', enableThinking = false) {
        // Validate sentence first
        this.validateSentence(sentence);

        // Dynamic model selection based on sentence length
        const sentenceLength = sentence.trim().length;
        const selectedModel = this.selectModelByComplexity('sentenceCheck', sentenceLength);

        console.log(`Dynamic model selection for sentence check: ${sentenceLength} chars -> ${selectedModel}`);

        // Get configuration for user with selected model
        const aiConfig = await this.getConfigurationForUser(userId, selectedModel);

        if (!aiConfig.apiKey) {
            throw new Error('No API key available. Please contact administrator or provide your own API key.');
        }

        try {
            // Create structured prompt for sentence checking using prompt loader
            const prompt = promptLoader.getSentenceCheckPrompt(sentence, grammarLanguageOption);

            // Prepare request data using configuration with thinking enabled/disabled
            const requestConfig = {
                ...aiConfig,
                requestTemplate: {
                    ...aiConfig.requestTemplate,
                    enable_thinking: enableThinking
                }
            };

            const {headers, requestBody} = HttpUtils.prepareRequestData(
                requestConfig,
                prompt,
                [] // No conversation history for sentence checking
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
            const parsedResponse = this.parseSentenceCheckResponse(content, locale);

            if (parsedResponse.isValid) {
                return {
                    success: true,
                    grammarAnalysis: parsedResponse.grammarAnalysis,
                    grammarCorrection: parsedResponse.grammarCorrection,
                    keywordAnalysis: parsedResponse.keywordAnalysis,
                    chineseDefinition: parsedResponse.chineseDefinition,
                    aiModel: aiConfig.model,
                    thinking: thinking,
                    rawResponse: response.data,
                    modelSelection: {
                        inputSize: sentenceLength,
                        selectedModel: selectedModel,
                        selectionReason: `Sentence length: ${sentenceLength} characters`
                    }
                };
            } else {
                // Check if this is a partial parse that we should accept
                const hasAnyUsefulContent = parsedResponse.grammarAnalysis ||
                    parsedResponse.grammarCorrection ||
                    parsedResponse.keywordAnalysis ||
                    parsedResponse.chineseDefinition;

                if (hasAnyUsefulContent) {
                    // Accept partial parse if we have some useful content
                    return {
                        success: true,
                        grammarAnalysis: parsedResponse.grammarAnalysis || '',
                        grammarCorrection: parsedResponse.grammarCorrection || '',
                        keywordAnalysis: parsedResponse.keywordAnalysis || '',
                        chineseDefinition: parsedResponse.chineseDefinition || '',
                        aiModel: aiConfig.model,
                        thinking: thinking,
                        rawResponse: response.data,
                        partialParse: true,
                        parseError: parsedResponse.error,
                        modelSelection: {
                            inputSize: sentenceLength,
                            selectedModel: selectedModel,
                            selectionReason: `Sentence length: ${sentenceLength} characters`
                        }
                    };
                }

                // Invalid format
                return {
                    success: false,
                    message: `Invalid response format: ${parsedResponse.error}`,
                    error: parsedResponse.error,
                    rawResponse: response.data
                };
            }

        } catch (error) {
            // Handle different types of errors
            if (error.response?.status === 429) {
                return {
                    success: false,
                    message: 'Rate limit exceeded. Please try again later.',
                    retryable: true
                };
            } else if (error.response?.status === 401) {
                return {
                    success: false,
                    message: 'Invalid API key or authentication failed.',
                    retryable: false
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'Request timeout. Please try again.',
                    retryable: true
                };
            } else if (error.response?.status === 400) {
                return {
                    success: false,
                    message: 'Invalid request to AI API',
                    retryable: false
                };
            } else {
                return {
                    success: false,
                    message: `AI service error: ${error.message}`,
                    retryable: true
                };
            }
        }
    }

    /**
     * Generate sentence using AI with platform configuration and dynamic model selection
     * @param {Array} words - Array of words to include
     * @param {string} userId - User ID (optional)
     * @param {Array} conversationHistory - Previous messages (optional)
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @param {string} locale - Locale for error messages (default: 'en')
     * @param {boolean} enableThinking - Whether to enable AI thinking process (default: false)
     * @returns {Object} Generated sentence and explanation
     */
    async generateSentence(words, userId = null, conversationHistory = [], grammarLanguageOption = 'combined', locale = 'en', enableThinking = false) {
        // Validate words first
        const cleanedWords = this.validateWords(words);

        // Dynamic model selection based on word count
        const wordCount = cleanedWords.length;
        const selectedModel = this.selectModelByComplexity('wordGeneration', wordCount);

        console.log(`Dynamic model selection for word generation: ${wordCount} words -> ${selectedModel}`);

        // Get configuration for user with selected model
        const aiConfig = await this.getConfigurationForUser(userId, selectedModel);

        if (!aiConfig.apiKey) {
            throw new Error('No API key available. Please contact administrator or provide your own API key.');
        }

        try {
            // Create structured prompt for consistent output format using prompt loader
            const prompt = promptLoader.getSentenceGenerationPrompt(cleanedWords, grammarLanguageOption);

            // Prepare request data using configuration with thinking enabled/disabled
            const requestConfig = {
                ...aiConfig,
                requestTemplate: {
                    ...aiConfig.requestTemplate,
                    enable_thinking: enableThinking
                }
            };

            const {headers, requestBody} = HttpUtils.prepareRequestData(
                requestConfig,
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
            const parsedResponse = this.parseStructuredResponse(content, locale);

            if (parsedResponse.isValid) {
                return {
                    success: true,
                    sentence: parsedResponse.sentence,
                    explanation: parsedResponse.grammarAnalysis,
                    chineseTranslation: parsedResponse.chineseTranslation,
                    aiModel: aiConfig.model,
                    thinking: thinking,
                    rawResponse: response.data,
                    modelSelection: {
                        inputSize: wordCount,
                        selectedModel: selectedModel,
                        selectionReason: `Word count: ${wordCount} words`
                    }
                };
            } else {
                // Check if this is a partial parse that we should accept
                const hasAnyUsefulContent = parsedResponse.sentence ||
                    parsedResponse.grammarAnalysis ||
                    parsedResponse.chineseTranslation;

                if (hasAnyUsefulContent) {
                    // Accept partial parse if we have some useful content
                    return {
                        success: true,
                        sentence: parsedResponse.sentence || '',
                        explanation: parsedResponse.grammarAnalysis || '',
                        chineseTranslation: parsedResponse.chineseTranslation || '',
                        aiModel: aiConfig.model,
                        thinking: thinking,
                        rawResponse: response.data,
                        partialParse: true,
                        parseError: parsedResponse.error,
                        modelSelection: {
                            inputSize: wordCount,
                            selectedModel: selectedModel,
                            selectionReason: `Word count: ${wordCount} words`
                        }
                    };
                }

                // Invalid format
                return {
                    success: false,
                    message: `Invalid response format: ${parsedResponse.error}`,
                    error: parsedResponse.error,
                    rawResponse: response.data
                };
            }

        } catch (error) {
            // Handle different types of errors
            if (error.response?.status === 429) {
                return {
                    success: false,
                    message: 'Rate limit exceeded. Please try again later.',
                    retryable: true
                };
            } else if (error.response?.status === 401) {
                return {
                    success: false,
                    message: 'Invalid API key or authentication failed.',
                    retryable: false
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'Request timeout. Please try again.',
                    retryable: true
                };
            } else if (error.response?.status === 400) {
                return {
                    success: false,
                    message: 'Invalid request to AI API',
                    retryable: false
                };
            } else {
                return {
                    success: false,
                    message: `AI service error: ${error.message}`,
                    retryable: true
                };
            }
        }
    }

    /**
     * Parse structured sentence check AI response with robust error handling
     * @param {string} content - AI response content
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Parsed response with validation
     */
    parseSentenceCheckResponse(content, locale = 'en') {
        try {
            const {
                grammarAnalysisMarker,
                grammarCorrectionMarker,
                keywordAnalysisMarker,
                chineseDefinitionMarker,
                endMarker
            } = this.checkResponseFormat;

            // Store original raw content for fallback
            const rawContent = content;

            // Clean up content - remove "(Parsing required)" and other unwanted text
            let cleanedContent = this.cleanResponseContent(content);

            // Add END_FORMAT if missing but other markers are present
            if (!cleanedContent.includes(endMarker)) {
                const hasOtherMarkers = [
                    grammarAnalysisMarker,
                    grammarCorrectionMarker,
                    keywordAnalysisMarker,
                    chineseDefinitionMarker
                ].some(marker => cleanedContent.includes(marker));

                if (hasOtherMarkers) {
                    cleanedContent += `\n\n${endMarker}`;
                }
            }

            // Track which markers are present
            const markerPresence = {
                grammarAnalysis: cleanedContent.includes(grammarAnalysisMarker),
                grammarCorrection: cleanedContent.includes(grammarCorrectionMarker),
                keywordAnalysis: cleanedContent.includes(keywordAnalysisMarker),
                chineseDefinition: cleanedContent.includes(chineseDefinitionMarker)
            };

            const presentMarkers = Object.values(markerPresence).filter(Boolean).length;

            // If no markers are present, this is a complete failure
            if (presentMarkers === 0) {
                return {
                    isValid: false,
                    error: i18n.t('ai.noValidMarkers', locale) + ` | Response preview: "${cleanedContent.substring(0, 200)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: '',
                    rawResponseContent: rawContent // Always include raw content on parse failure
                };
            }

            // Extract content sections using robust parsing
            const sections = this.extractSectionsRobust(cleanedContent, {
                grammarAnalysisMarker,
                grammarCorrectionMarker,
                keywordAnalysisMarker,
                chineseDefinitionMarker,
                endMarker
            });

            // Validate that at least some meaningful content was extracted
            const hasValidContent = Object.values(sections).some(section =>
                section && section.length >= 10
            );

            if (!hasValidContent) {
                return {
                    isValid: false,
                    error: i18n.t('ai.noValidContent', locale) + ` | Extracted sections lengths: GA:${sections.grammarAnalysis?.length || 0}, GC:${sections.grammarCorrection?.length || 0}, KA:${sections.keywordAnalysis?.length || 0}, CD:${sections.chineseDefinition?.length || 0}`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: '',
                    rawResponseContent: rawContent // Always include raw content on parse failure
                };
            }

            // Determine if we should include raw content (for partial parses or debugging)
            const isPartialParse = presentMarkers < 4;
            const hasAnyMissingContent = Object.values(sections).some(section => !section || section.length < 10);

            // Return successfully parsed content, even if some sections are missing
            const result = {
                isValid: true,
                grammarAnalysis: sections.grammarAnalysis || '',
                grammarCorrection: sections.grammarCorrection || '',
                keywordAnalysis: sections.keywordAnalysis || '',
                chineseDefinition: sections.chineseDefinition || '',
                error: null,
                partialParse: isPartialParse, // Indicate if this was a partial parse
                missingMarkers: Object.entries(markerPresence)
                    .filter(([_, present]) => !present)
                    .map(([marker, _]) => marker)
            };

            // Include raw content if it's a partial parse or has missing content for debugging
            if (isPartialParse || hasAnyMissingContent) {
                result.rawResponseContent = rawContent;
            }

            return result;

        } catch (error) {
            return {
                isValid: false,
                error: i18n.t('ai.parseError', locale, {message: error.message}) + ` | Response preview: "${content.substring(0, 200)}..."`,
                grammarAnalysis: '',
                grammarCorrection: '',
                keywordAnalysis: '',
                chineseDefinition: '',
                rawResponseContent: content // Always include raw content on exception
            };
        }
    }

    /**
     * Parse structured AI response to extract sentence and grammar analysis with robust error handling
     * @param {string} content - AI response content
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Parsed response with validation
     */
    parseStructuredResponse(content, locale = 'en') {
        try {
            const {sentenceMarker, grammarMarker, chineseMarker, endMarker} = this.responseFormat;

            // Store original raw content for fallback
            const rawContent = content;

            // Clean up content - remove "(Parsing required)" and other unwanted text
            let cleanedContent = this.cleanResponseContent(content);

            // Add END_FORMAT if missing but other markers are present
            if (!cleanedContent.includes(endMarker)) {
                const hasOtherMarkers = [sentenceMarker, grammarMarker, chineseMarker]
                    .some(marker => cleanedContent.includes(marker));

                if (hasOtherMarkers) {
                    cleanedContent += `\n\n${endMarker}`;
                }
            }

            // Track which markers are present
            const markerPresence = {
                sentence: cleanedContent.includes(sentenceMarker),
                grammar: cleanedContent.includes(grammarMarker),
                chinese: cleanedContent.includes(chineseMarker)
            };

            const presentMarkers = Object.values(markerPresence).filter(Boolean).length;

            // If no markers are present, this is a complete failure
            if (presentMarkers === 0) {
                return {
                    isValid: false,
                    error: i18n.t('ai.noValidMarkers', locale) + ` | Response preview: "${cleanedContent.substring(0, 200)}..."`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: '',
                    rawResponseContent: rawContent // Always include raw content on parse failure
                };
            }

            // Extract content sections using robust parsing
            const sections = this.extractSectionsRobust(cleanedContent, {
                sentenceMarker,
                grammarMarker,
                chineseMarker,
                endMarker
            });

            // Validate that at least some meaningful content was extracted
            const hasValidContent = Object.values(sections).some(section =>
                section && section.length >= 5
            );

            if (!hasValidContent) {
                return {
                    isValid: false,
                    error: i18n.t('ai.noValidContent', locale) + ` | Extracted sections lengths: S:${sections.sentence?.length || 0}, GA:${sections.grammarAnalysis?.length || 0}, CT:${sections.chineseTranslation?.length || 0}`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: '',
                    rawResponseContent: rawContent // Always include raw content on parse failure
                };
            }

            // Determine if we should include raw content (for partial parses or debugging)
            const isPartialParse = presentMarkers < 3;
            const hasAnyMissingContent = Object.values(sections).some(section => !section || section.length < 5);

            // Return successfully parsed content, even if some sections are missing
            const result = {
                isValid: true,
                sentence: sections.sentence || '',
                grammarAnalysis: sections.grammarAnalysis || '',
                chineseTranslation: sections.chineseTranslation || '',
                error: null,
                partialParse: isPartialParse, // Indicate if this was a partial parse
                missingMarkers: Object.entries(markerPresence)
                    .filter(([_, present]) => !present)
                    .map(([marker, _]) => marker)
            };

            // Include raw content if it's a partial parse or has missing content for debugging
            if (isPartialParse || hasAnyMissingContent) {
                result.rawResponseContent = rawContent;
            }

            return result;

        } catch (error) {
            return {
                isValid: false,
                error: i18n.t('ai.parseError', locale, {message: error.message}) + ` | Response preview: "${content.substring(0, 200)}..."`,
                sentence: '',
                grammarAnalysis: '',
                chineseTranslation: '',
                rawResponseContent: content // Always include raw content on exception
            };
        }
    }

    /**
     * Clean response content by removing unwanted text and formatting issues
     * @param {string} content - Raw AI response content
     * @returns {string} Cleaned content
     */
    cleanResponseContent(content) {
        if (!content) return '';

        let cleaned = content;

        // Remove "(Parsing required)" text
        cleaned = cleaned.replace(/\(Parsing required\)/gi, '');

        // Remove excessive whitespace while preserving structure
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

        // Remove leading/trailing whitespace from each line while preserving overall structure
        cleaned = cleaned.split('\n')
            .map(line => line.trim())
            .join('\n');

        // Clean up any markdown artifacts that might interfere
        cleaned = cleaned.replace(/```[\s\S]*?```/g, ''); // Remove code blocks
        cleaned = cleaned.replace(/^\s*#{1,6}\s*/gm, ''); // Remove markdown headers

        return cleaned.trim();
    }

    /**
     * Extract sections from content using robust parsing that handles missing markers
     * @param {string} content - Cleaned content to parse
     * @param {Object} markers - Object containing all markers
     * @returns {Object} Extracted sections
     */
    extractSectionsRobust(content, markers) {
        const sections = {};

        // For sentence checking response
        if (markers.grammarAnalysisMarker) {
            sections.grammarAnalysis = this.extractSection(
                content,
                markers.grammarAnalysisMarker,
                [markers.grammarCorrectionMarker, markers.keywordAnalysisMarker, markers.chineseDefinitionMarker, markers.endMarker]
            );

            sections.grammarCorrection = this.extractSection(
                content,
                markers.grammarCorrectionMarker,
                [markers.keywordAnalysisMarker, markers.chineseDefinitionMarker, markers.endMarker]
            );

            sections.keywordAnalysis = this.extractSection(
                content,
                markers.keywordAnalysisMarker,
                [markers.chineseDefinitionMarker, markers.endMarker]
            );

            sections.chineseDefinition = this.extractSection(
                content,
                markers.chineseDefinitionMarker,
                [markers.endMarker]
            );
        }

        // For sentence generation response
        if (markers.sentenceMarker) {
            sections.sentence = this.extractSection(
                content,
                markers.sentenceMarker,
                [markers.grammarMarker, markers.chineseMarker, markers.endMarker]
            );

            sections.grammarAnalysis = this.extractSection(
                content,
                markers.grammarMarker,
                [markers.chineseMarker, markers.endMarker]
            );

            sections.chineseTranslation = this.extractSection(
                content,
                markers.chineseMarker,
                [markers.endMarker]
            );
        }

        return sections;
    }

    /**
     * Extract a single section from content using flexible parsing
     * @param {string} content - Content to search in
     * @param {string} startMarker - Marker that starts the section
     * @param {Array} endMarkers - Array of possible end markers (first found wins)
     * @returns {string|null} Extracted section content or null if not found
     */
    extractSection(content, startMarker, endMarkers = []) {
        const startIndex = content.indexOf(startMarker);
        if (startIndex === -1) {
            return null; // Marker not found
        }

        const contentStart = startIndex + startMarker.length;

        // Find the earliest end marker
        let endIndex = content.length; // Default to end of content

        for (const endMarker of endMarkers) {
            const markerIndex = content.indexOf(endMarker, contentStart);
            if (markerIndex !== -1 && markerIndex < endIndex) {
                endIndex = markerIndex;
            }
        }

        const extractedContent = content.substring(contentStart, endIndex).trim();

        // Return content only if it has meaningful length
        return extractedContent.length >= 5 ? extractedContent : null;
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
                enable_thinking: true,
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
     * Get platform configuration info (without sensitive data) with model selection details
     * @returns {Object} Platform configuration info
     */
    getPlatformConfigInfo() {
        // Get prompt system information
        const promptValidation = promptLoader.validatePromptFiles();
        const promptCache = promptLoader.getCacheInfo();

        return {
            provider: "SiliconFlow",
            defaultModel: this.platformConfig.model,
            dynamicModels: {
                light: config.siliconflowModelLight || 'Qwen/Qwen3-8B',
                medium: config.siliconflowModelMedium || 'Qwen/Qwen3-14B',
                heavy: config.siliconflowModelHeavy || 'Qwen/Qwen3-30B-A3B'
            },
            modelSelection: {
                wordGeneration: {
                    maxWords: this.modelThresholds.wordGeneration.max,
                    lightThreshold: this.modelThresholds.wordGeneration.lightThreshold,
                    mediumThreshold: this.modelThresholds.wordGeneration.mediumThreshold
                },
                sentenceCheck: {
                    maxCharacters: this.modelThresholds.sentenceCheck.max,
                    lightThreshold: this.modelThresholds.sentenceCheck.lightThreshold,
                    mediumThreshold: this.modelThresholds.sentenceCheck.mediumThreshold
                }
            },
            promptSystem: {
                promptsValid: promptValidation.valid,
                availablePrompts: promptValidation.existing,
                missingPrompts: promptValidation.missing,
                promptsDirectory: promptValidation.promptsDirectory,
                cacheStatus: promptCache
            },
            apiUrl: this.platformConfig.apiUrl,
            features: [
                "Dynamic model selection based on complexity",
                "Advanced reasoning with QwQ model",
                "Grammar explanations",
                "Natural sentence generation",
                "Multi-word integration",
                "Modular prompt system with multi-language support"
            ]
        };
    }

    /**
     * Validate prompt system
     * @returns {Object} Prompt system validation result
     */
    validatePromptSystem() {
        return promptLoader.validatePromptFiles();
    }

    /**
     * Clear prompt cache (useful for development when updating prompt files)
     */
    clearPromptCache() {
        promptLoader.clearCache();
    }

    /**
     * Validate sentence
     * @param {string} sentence - Sentence to validate
     * @returns {string} Cleaned sentence
     */
    validateSentence(sentence) {
        if (typeof sentence !== 'string') {
            throw new Error('Sentence must be a string');
        }

        if (sentence.trim().length === 0) {
            throw new Error('Sentence cannot be empty');
        }

        if (sentence.trim().length > 800) {
            throw new Error('Sentence must be 800 characters or less');
        }

        // Basic validation for reasonable text (allow letters, numbers, punctuation, spaces)
        if (!/^[a-zA-Z0-9\s.,!?;:\-'"()\[\]{}]+$/.test(sentence.trim())) {
            throw new Error('Sentence contains invalid characters');
        }

        return sentence.trim();
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