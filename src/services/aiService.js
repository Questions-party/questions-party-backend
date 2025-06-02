const axios = require('axios');
const config = require('../../config/config');
const User = require('../models/User');
const HttpUtils = require('../utils/httpUtils');
const i18n = require('../utils/i18n');

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
     * Check sentence using AI with platform configuration
     * @param {string} sentence - Sentence to check
     * @param {string} userId - User ID (optional)
     * @param {number} maxRetries - Maximum retry attempts (default: 3)
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Sentence check result with retry info
     */
    async checkSentence(sentence, userId = null, maxRetries = 3, grammarLanguageOption = 'combined', locale = 'en') {
        // Validate sentence first
        this.validateSentence(sentence);

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
                // Create structured prompt for sentence checking
                const prompt = this.createSentenceCheckPrompt(sentence, grammarLanguageOption);

                // Prepare request data using configuration
                const {headers, requestBody} = HttpUtils.prepareRequestData(
                    aiConfig,
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
                        grammarAnalysis: parsedResponse.grammarAnalysis,
                        grammarCorrection: parsedResponse.grammarCorrection,
                        keywordAnalysis: parsedResponse.keywordAnalysis,
                        chineseDefinition: parsedResponse.chineseDefinition,
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
        throw lastError || new Error(`Failed to check sentence after ${maxRetries} attempts`);
    }

    /**
     * Generate sentence using AI with platform configuration
     * @param {Array} words - Array of words to include
     * @param {string} userId - User ID (optional)
     * @param {Array} conversationHistory - Previous messages (optional)
     * @param {number} maxRetries - Maximum retry attempts (default: 3)
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Generated sentence and explanation with retry info
     */
    async generateSentence(words, userId = null, conversationHistory = [], maxRetries = 3, grammarLanguageOption = 'combined', locale = 'en') {
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
                const parsedResponse = this.parseStructuredResponse(content, locale);

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
     * Create structured prompt for sentence checking
     * @param {string} sentence - Sentence to check
     * @param {string} grammarLanguageOption - Grammar explanation language option ('combined' or 'pure')
     * @returns {string} Structured prompt
     */
    createSentenceCheckPrompt(sentence, grammarLanguageOption) {
        if (grammarLanguageOption === 'combined') {
            // Combined Chinese and English explanation (default)
            return `You are an English language tutor and grammar expert. 

CRITICAL FORMATTING REQUIREMENT: You MUST use the EXACT format shown below. Do NOT deviate from this format. Do NOT add extra formatting, numbering, or bullet points in the section headers. Each section must start with the exact marker shown and contain only the content requested.

SENTENCE TO ANALYZE: "${sentence}"

MANDATORY OUTPUT FORMAT (follow EXACTLY):

GRAMMAR_ANALYSIS:
Provide comprehensive grammar analysis covering overall sentence structure and correctness, grammar rules that apply or are violated, detailed explanation of each grammatical element, and educational insights about the grammar used. 

Provide the explanation in both English and Chinese for better understanding, with key grammar terms explained in both languages. 

Organize your analysis clearly with proper paragraph breaks for readability. Use natural flowing text without numbered lists or bullet points within this section.

GRAMMAR_CORRECTION:
If there are any grammar errors, provide the corrected sentence here. If the sentence is already correct, write "The sentence is grammatically correct." and provide an alternative or improved version if possible.

KEYWORD_ANALYSIS:
Analyze the key words and phrases in the sentence including important vocabulary and their functions, phrases and their meanings, word choice analysis, and suggestions for vocabulary enhancement. 

Present this analysis in clear, well-organized paragraphs with proper spacing for easy reading.

CHINESE_DEFINITION:
Provide a natural and accurate Chinese translation/definition of the sentence, explaining the meaning and context.

END_FORMAT

FORMATTING GUIDELINES FOR READABILITY:
- Use proper paragraph breaks between different points within each section
- Add blank lines between major concepts for visual clarity
- Write in clear, flowing prose that's easy to read
- Organize content logically within each section
- Ensure each section has substantial, well-structured content

CRITICAL REMINDERS:
- Use ONLY the exact section headers shown above (GRAMMAR_ANALYSIS:, GRAMMAR_CORRECTION:, KEYWORD_ANALYSIS:, CHINESE_DEFINITION:, END_FORMAT)
- Do NOT add numbers, bullets, or extra formatting to the headers
- Do NOT add extra text before or after the required sections
- Each section must contain substantial content (minimum 20 characters for analysis sections)
- Focus on clarity, readability, and proper formatting within sections

Sentence to analyze: "${sentence}"`;
        } else {
            // Pure English explanation
            return `You are an English language tutor and grammar expert.

CRITICAL FORMATTING REQUIREMENT: You MUST use the EXACT format shown below. Do NOT deviate from this format. Do NOT add extra formatting, numbering, or bullet points in the section headers. Each section must start with the exact marker shown and contain only the content requested.

SENTENCE TO ANALYZE: "${sentence}"

MANDATORY OUTPUT FORMAT (follow EXACTLY):

GRAMMAR_ANALYSIS:
Provide comprehensive grammar analysis covering overall sentence structure and correctness, grammar rules that apply or are violated, detailed explanation of each grammatical element, and educational insights about the grammar used. 

Provide the explanation in clear, comprehensive English only. 

Organize your analysis clearly with proper paragraph breaks for readability. Use natural flowing text without numbered lists or bullet points within this section.

GRAMMAR_CORRECTION:
If there are any grammar errors, provide the corrected sentence here. If the sentence is already correct, write "The sentence is grammatically correct." and provide an alternative or improved version if possible.

KEYWORD_ANALYSIS:
Analyze the key words and phrases in the sentence including important vocabulary and their functions, phrases and their meanings, word choice analysis, and suggestions for vocabulary enhancement. 

Present this analysis in clear, well-organized paragraphs with proper spacing for easy reading.

CHINESE_DEFINITION:
Provide a natural and accurate Chinese translation/definition of the sentence, explaining the meaning and context.

END_FORMAT

FORMATTING GUIDELINES FOR READABILITY:
- Use proper paragraph breaks between different points within each section
- Add blank lines between major concepts for visual clarity
- Write in clear, flowing prose that's easy to read
- Organize content logically within each section
- Ensure each section has substantial, well-structured content

CRITICAL REMINDERS:
- Use ONLY the exact section headers shown above (GRAMMAR_ANALYSIS:, GRAMMAR_CORRECTION:, KEYWORD_ANALYSIS:, CHINESE_DEFINITION:, END_FORMAT)
- Do NOT add numbers, bullets, or extra formatting to the headers
- Do NOT add extra text before or after the required sections
- Each section must contain substantial content (minimum 20 characters for analysis sections)
- Focus on clarity, readability, and proper formatting within sections

Sentence to analyze: "${sentence}"`;
        }
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

CRITICAL FORMATTING REQUIREMENT: You MUST use the EXACT format shown below. Do NOT deviate from this format. Do NOT add extra formatting, numbering, or bullet points in the section headers. Each section must start with the exact marker shown and contain only the content requested.

MANDATORY OUTPUT FORMAT (follow EXACTLY):

SENTENCE:
Write a single, grammatically correct sentence using ALL the provided words naturally.

GRAMMAR_ANALYSIS:
Provide detailed grammar explanation covering sentence structure (subject, predicate, objects, etc.), how each word functions in the sentence, grammar rules demonstrated, and educational insights about word usage. 

Provide the explanation in both English and Chinese for better understanding, with key grammar terms explained in both languages. 

Organize your analysis clearly with proper paragraph breaks for readability. Use natural flowing text without numbered lists or bullet points within this section.

CHINESE_TRANSLATION:
Provide a natural and accurate Chinese translation of the sentence, maintaining the meaning and context.

END_FORMAT

FORMATTING GUIDELINES FOR READABILITY:
- Use proper paragraph breaks between different points within each section
- Add blank lines between major concepts for visual clarity
- Write in clear, flowing prose that's easy to read
- Organize content logically within each section
- Ensure each section has substantial, well-structured content

CRITICAL REMINDERS:
- Use ALL provided words: ${cleanedWords.join(', ')}
- Use ONLY the exact section headers shown above (SENTENCE:, GRAMMAR_ANALYSIS:, CHINESE_TRANSLATION:, END_FORMAT)
- Do NOT add numbers, bullets, or extra formatting to the headers
- Do NOT add extra text before or after the required sections
- The sentence must be natural and meaningful
- Grammar analysis must be detailed and educational, provided in both English and Chinese
- Chinese translation must be accurate and natural
- Focus on clarity, readability, and proper formatting within sections

Words to include: ${cleanedWords.join(', ')}`;
        } else {
            // Pure English explanation
            return `You are an English language tutor. Create a single natural sentence that incorporates ALL of the following words: ${cleanedWords.join(', ')}

CRITICAL FORMATTING REQUIREMENT: You MUST use the EXACT format shown below. Do NOT deviate from this format. Do NOT add extra formatting, numbering, or bullet points in the section headers. Each section must start with the exact marker shown and contain only the content requested.

MANDATORY OUTPUT FORMAT (follow EXACTLY):

SENTENCE:
Write a single, grammatically correct sentence using ALL the provided words naturally.

GRAMMAR_ANALYSIS:
Provide detailed grammar explanation covering sentence structure (subject, predicate, objects, etc.), how each word functions in the sentence, grammar rules demonstrated, and educational insights about word usage. 

Provide the explanation in clear, comprehensive English only. 

Organize your analysis clearly with proper paragraph breaks for readability. Use natural flowing text without numbered lists or bullet points within this section.

CHINESE_TRANSLATION:
Provide a natural and accurate Chinese translation of the sentence, maintaining the meaning and context.

END_FORMAT

FORMATTING GUIDELINES FOR READABILITY:
- Use proper paragraph breaks between different points within each section
- Add blank lines between major concepts for visual clarity
- Write in clear, flowing prose that's easy to read
- Organize content logically within each section
- Ensure each section has substantial, well-structured content

CRITICAL REMINDERS:
- Use ALL provided words: ${cleanedWords.join(', ')}
- Use ONLY the exact section headers shown above (SENTENCE:, GRAMMAR_ANALYSIS:, CHINESE_TRANSLATION:, END_FORMAT)
- Do NOT add numbers, bullets, or extra formatting to the headers
- Do NOT add extra text before or after the required sections
- The sentence must be natural and meaningful
- Grammar analysis must be detailed and educational, provided in English only
- Chinese translation must be accurate and natural
- Focus on clarity, readability, and proper formatting within sections

Words to include: ${cleanedWords.join(', ')}`;
        }
    }

    /**
     * Parse structured sentence check AI response
     * @param {string} content - AI response content
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Parsed response with validation
     */
    parseSentenceCheckResponse(content, locale = 'en') {
        try {
            const { grammarAnalysisMarker, grammarCorrectionMarker, keywordAnalysisMarker, chineseDefinitionMarker, endMarker } = this.checkResponseFormat;
            
            // Check if all required markers are present
            const missingMarkers = [];
            if (!content.includes(grammarAnalysisMarker)) missingMarkers.push(grammarAnalysisMarker);
            if (!content.includes(grammarCorrectionMarker)) missingMarkers.push(grammarCorrectionMarker);
            if (!content.includes(keywordAnalysisMarker)) missingMarkers.push(keywordAnalysisMarker);
            if (!content.includes(chineseDefinitionMarker)) missingMarkers.push(chineseDefinitionMarker);
            
            if (missingMarkers.length > 0) {
                return {
                    isValid: false,
                    error: i18n.t('ai.missingFormatMarkers', locale, { 
                        markers: missingMarkers.join(', ')
                    }) + ` | Response preview: "${content.substring(0, 200)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            // Verify marker order
            const grammarAnalysisIndex = content.indexOf(grammarAnalysisMarker);
            const grammarCorrectionIndex = content.indexOf(grammarCorrectionMarker);
            const keywordAnalysisIndex = content.indexOf(keywordAnalysisMarker);
            const chineseDefinitionIndex = content.indexOf(chineseDefinitionMarker);

            if (grammarAnalysisIndex >= grammarCorrectionIndex || 
                grammarCorrectionIndex >= keywordAnalysisIndex || 
                keywordAnalysisIndex >= chineseDefinitionIndex) {
                return {
                    isValid: false,
                    error: i18n.t('ai.invalidMarkerOrder', locale, { 
                        expected: 'GRAMMAR_ANALYSIS → GRAMMAR_CORRECTION → KEYWORD_ANALYSIS → CHINESE_DEFINITION' 
                    }) + ` | Found order: GA:${grammarAnalysisIndex}, GC:${grammarCorrectionIndex}, KA:${keywordAnalysisIndex}, CD:${chineseDefinitionIndex}`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            // Extract grammar analysis section
            const grammarAnalysisStart = grammarAnalysisIndex + grammarAnalysisMarker.length;
            const grammarAnalysisSection = content.substring(grammarAnalysisStart, grammarCorrectionIndex).trim();
            
            // Extract grammar correction section
            const grammarCorrectionStart = grammarCorrectionIndex + grammarCorrectionMarker.length;
            const grammarCorrectionSection = content.substring(grammarCorrectionStart, keywordAnalysisIndex).trim();

            // Extract keyword analysis section  
            const keywordAnalysisStart = keywordAnalysisIndex + keywordAnalysisMarker.length;
            const keywordAnalysisSection = content.substring(keywordAnalysisStart, chineseDefinitionIndex).trim();

            // Extract Chinese definition section
            const chineseDefinitionStart = chineseDefinitionIndex + chineseDefinitionMarker.length;
            const endFormatIndex = content.indexOf(endMarker);
            
            let chineseDefinitionSection;
            if (endFormatIndex !== -1) {
                chineseDefinitionSection = content.substring(chineseDefinitionStart, endFormatIndex).trim();
            } else {
                chineseDefinitionSection = content.substring(chineseDefinitionStart).trim();
            }

            // Validate extracted content with specific error messages
            if (!grammarAnalysisSection || grammarAnalysisSection.length < 20) {
                return {
                    isValid: false,
                    error: i18n.t('ai.grammarAnalysisTooShort', locale) + ` | Length: ${grammarAnalysisSection.length}, Content: "${grammarAnalysisSection.substring(0, 100)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            if (!grammarCorrectionSection || grammarCorrectionSection.length < 10) {
                return {
                    isValid: false,
                    error: i18n.t('ai.grammarCorrectionTooShort', locale) + ` | Length: ${grammarCorrectionSection.length}, Content: "${grammarCorrectionSection.substring(0, 100)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            if (!keywordAnalysisSection || keywordAnalysisSection.length < 20) {
                return {
                    isValid: false,
                    error: i18n.t('ai.keywordAnalysisTooShort', locale) + ` | Length: ${keywordAnalysisSection.length}, Content: "${keywordAnalysisSection.substring(0, 100)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            if (!chineseDefinitionSection || chineseDefinitionSection.length < 10) {
                return {
                    isValid: false,
                    error: i18n.t('ai.chineseDefinitionTooShort', locale) + ` | Length: ${chineseDefinitionSection.length}, Content: "${chineseDefinitionSection.substring(0, 100)}..."`,
                    grammarAnalysis: '',
                    grammarCorrection: '',
                    keywordAnalysis: '',
                    chineseDefinition: ''
                };
            }

            return {
                isValid: true,
                grammarAnalysis: grammarAnalysisSection,
                grammarCorrection: grammarCorrectionSection,
                keywordAnalysis: keywordAnalysisSection,
                chineseDefinition: chineseDefinitionSection,
                error: null
            };

        } catch (error) {
            return {
                isValid: false,
                error: i18n.t('ai.parseError', locale, { message: error.message }) + ` | Response preview: "${content.substring(0, 200)}..."`,
                grammarAnalysis: '',
                grammarCorrection: '',
                keywordAnalysis: '',
                chineseDefinition: ''
            };
        }
    }

    /**
     * Parse structured AI response to extract sentence and grammar analysis
     * @param {string} content - AI response content
     * @param {string} locale - Locale for error messages (default: 'en')
     * @returns {Object} Parsed response with validation
     */
    parseStructuredResponse(content, locale = 'en') {
        try {
            const { sentenceMarker, grammarMarker, chineseMarker, endMarker } = this.responseFormat;
            
            // Check if all required markers are present
            const missingMarkers = [];
            if (!content.includes(sentenceMarker)) missingMarkers.push(sentenceMarker);
            if (!content.includes(grammarMarker)) missingMarkers.push(grammarMarker);
            if (!content.includes(chineseMarker)) missingMarkers.push(chineseMarker);
            
            if (missingMarkers.length > 0) {
                return {
                    isValid: false,
                    error: i18n.t('ai.missingFormatMarkers', locale, { 
                        markers: missingMarkers.join(', ')
                    }) + ` | Response preview: "${content.substring(0, 200)}..."`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            // Verify marker order
            const sentenceIndex = content.indexOf(sentenceMarker);
            const grammarIndex = content.indexOf(grammarMarker);
            const chineseIndex = content.indexOf(chineseMarker);

            if (sentenceIndex >= grammarIndex || grammarIndex >= chineseIndex) {
                return {
                    isValid: false,
                    error: i18n.t('ai.invalidMarkerOrder', locale, { 
                        expected: 'SENTENCE → GRAMMAR_ANALYSIS → CHINESE_TRANSLATION' 
                    }) + ` | Found order: S:${sentenceIndex}, GA:${grammarIndex}, CT:${chineseIndex}`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            // Extract sentence section
            const sentenceStart = sentenceIndex + sentenceMarker.length;
            const sentenceSection = content.substring(sentenceStart, grammarIndex).trim();
            
            // Extract grammar analysis section
            const grammarAnalysisStart = grammarIndex + grammarMarker.length;
            const grammarSection = content.substring(grammarAnalysisStart, chineseIndex).trim();

            // Extract Chinese translation section
            const chineseTranslationStart = chineseIndex + chineseMarker.length;
            const endFormatIndex = content.indexOf(endMarker);
            
            let chineseTranslationSection;
            if (endFormatIndex !== -1) {
                chineseTranslationSection = content.substring(chineseTranslationStart, endFormatIndex).trim();
            } else {
                chineseTranslationSection = content.substring(chineseTranslationStart).trim();
            }

            // Validate extracted content with specific error messages
            if (!sentenceSection || sentenceSection.length < 10) {
                return {
                    isValid: false,
                    error: i18n.t('ai.sentenceSectionTooShort', locale) + ` | Length: ${sentenceSection.length}, Content: "${sentenceSection.substring(0, 100)}..."`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            if (!grammarSection || grammarSection.length < 20) {
                return {
                    isValid: false,
                    error: i18n.t('ai.grammarAnalysisTooShort', locale) + ` | Length: ${grammarSection.length}, Content: "${grammarSection.substring(0, 100)}..."`,
                    sentence: '',
                    grammarAnalysis: '',
                    chineseTranslation: ''
                };
            }

            if (!chineseTranslationSection || chineseTranslationSection.length < 10) {
                return {
                    isValid: false,
                    error: i18n.t('ai.chineseTranslationTooShort', locale) + ` | Length: ${chineseTranslationSection.length}, Content: "${chineseTranslationSection.substring(0, 100)}..."`,
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
                error: i18n.t('ai.parseError', locale, { message: error.message }) + ` | Response preview: "${content.substring(0, 200)}..."`,
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