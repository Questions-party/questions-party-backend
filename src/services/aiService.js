const axios = require('axios');
const config = require('../../config/config');
const AIConfig = require('../models/AIConfig');
const HttpUtils = require('../utils/httpUtils');

class AIService {
  constructor() {
    // Default configuration for SiliconFlow
    this.defaultConfig = {
      apiUrl: config.siliconflowApiUrl,
      model: config.siliconflowModel,
      timeout: 30000
    };
  }

  /**
   * Get or create default AI configuration for a user
   * @param {string} userId - User ID
   * @returns {Object} AI configuration object
   */
  async getOrCreateDefaultConfig(userId) {
    // Try to find an available configuration for the user
    let aiConfig = await AIConfig.findOne({ 
      userId, 
      isAvailable: true 
    }).sort({ lastUsedTime: -1 });

    // If no available config found, create a default SiliconFlow configuration
    if (!aiConfig) {
      aiConfig = await this.createDefaultSiliconFlowConfig(userId);
    }

    return aiConfig;
  }

  /**
   * Create default SiliconFlow configuration
   * @param {string} userId - User ID
   * @returns {Object} Created AI configuration
   */
  async createDefaultSiliconFlowConfig(userId) {
    const defaultConfig = {
      userId,
      name: "SiliconFlow Default",
      apiUrl: config.siliconflowApiUrl,
      apiKey: config.siliconflowApiKey || "", // Use system key or require user to provide
      apiKeyPlacement: "header",
      model: config.siliconflowModel,
      
      requestTemplate: {
        model: config.siliconflowModel,
        messages: [], // Populated dynamically
        max_tokens: 512,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        stream: false,
        frequency_penalty: 0.5,
        response_format: { type: "text" }
      },
      
      responseTemplate: {
        id: "example_id",
        object: "chat.completion",
        created: 1234567890,
        model: config.siliconflowModel,
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "",
            reasoning_content: ""
          },
          finish_reason: "stop"
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          completion_tokens_details: {
            reasoning_tokens: 0
          }
        }
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
      
      headers: new Map([['Content-Type', 'application/json']]),
      isAvailable: !!config.siliconflowApiKey, // Available if system API key exists
      lastUsedTime: new Date()
    };

    return await AIConfig.create(defaultConfig);
  }

  /**
   * Generate sentence using AI with configuration-driven approach
   * @param {Array} words - Array of words to include
   * @param {string} userId - User ID (optional)
   * @param {Object} customConfig - Custom AI configuration (optional)
   * @param {Array} conversationHistory - Previous messages (optional)
   * @returns {Object} Generated sentence and explanation
   */
  async generateSentence(words, userId = null, customConfig = null, conversationHistory = []) {
    // Validate words first
    const cleanedWords = this.validateWords(words);

    // Get AI configuration
    let aiConfig;
    if (customConfig) {
      aiConfig = customConfig;
    } else if (userId) {
      aiConfig = await this.getOrCreateDefaultConfig(userId);
    } else {
      // Use system default configuration
      aiConfig = await this.createSystemDefaultConfig();
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
      const { headers, requestBody } = HttpUtils.prepareRequestData(
        aiConfig, 
        prompt, 
        conversationHistory
      );

      // Make HTTP request
      const response = await axios.post(aiConfig.apiUrl, requestBody, {
        headers,
        timeout: aiConfig.timeout || this.defaultConfig.timeout
      });

      // Process response using configuration
      const { content, thinking } = HttpUtils.processAiResponse(
        JSON.stringify(response.data), 
        aiConfig
      );

      // Update configuration usage if it belongs to a user
      if (userId && aiConfig._id) {
        await this.markConfigurationAsAvailable(aiConfig._id, true);
      }

      return {
        sentence: content,
        explanation: thinking || 'Grammar explanation provided by AI',
        aiModel: aiConfig.model,
        rawResponse: response.data
      };
    } catch (error) {
      // Update configuration availability on error
      if (userId && aiConfig._id) {
        await this.markConfigurationAsAvailable(aiConfig._id, false);
      }

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
   * Create system default configuration (no user required)
   * @returns {Object} System default configuration
   */
  async createSystemDefaultConfig() {
    return {
      name: "System Default",
      apiUrl: config.siliconflowApiUrl,
      apiKey: config.siliconflowApiKey,
      apiKeyPlacement: "header",
      model: config.siliconflowModel,
      requestTemplate: {
        model: config.siliconflowModel,
        messages: [],
        max_tokens: 512,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        stream: false,
        frequency_penalty: 0.5,
        response_format: { type: "text" }
      },
      requestMessageGroupPath: "messages",
      requestRolePathFromGroup: "role",
      requestTextPathFromGroup: "content",
      responseTextPath: "choices[0].message.content",
      responseThinkingTextPath: "choices[0].message.reasoning_content",
      requestUserRoleField: "user",
      requestAssistantField: "assistant",
      requestSystemField: "system",
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    };
  }

  /**
   * Mark configuration as available/unavailable and update last used time
   * @param {string} configId - Configuration ID
   * @param {boolean} available - Availability status
   */
  async markConfigurationAsAvailable(configId, available) {
    try {
      await AIConfig.findByIdAndUpdate(
        configId,
        {
          isAvailable: available,
          lastUsedTime: new Date()
        }
      );
    } catch (error) {
      console.error('Error updating configuration availability:', error);
    }
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

  /**
   * Test AI configuration
   * @param {Object} config - AI configuration to test
   * @param {string} secretKey - Secret key for decryption (optional)
   * @returns {Object} Test result
   */
  async testConfiguration(config, secretKey = null) {
    try {
      // Set secret key if provided
      if (secretKey) {
        config.secretKey = secretKey;
      }

      // Prepare test request
      const testMessage = "Hello, nice to meet you.";
      const { headers, requestBody } = HttpUtils.prepareRequestData(config, testMessage);

      // Make test request
      const response = await axios.post(config.apiUrl, requestBody, {
        headers,
        timeout: config.timeout || 30000
      });

      // Process response
      const { content, thinking } = HttpUtils.processAiResponse(
        JSON.stringify(response.data), 
        config
      );

      return {
        success: true,
        message: "Connection successful",
        response: {
          role: "assistant",
          content: content,
          thinking: thinking
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Error connecting to AI API",
        error: error.message
      };
    }
  }
}

module.exports = new AIService(); 