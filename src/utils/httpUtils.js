class HttpUtils {
  /**
   * Set a value in an object using a dynamic path
   * @param {Object} obj - The object to modify
   * @param {string} path - The path string (e.g., "messages" or "choices[0].message.content")
   * @param {*} value - The value to set
   */
  static setValueByPath(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      
      if (key.includes('[') && key.includes(']')) {
        const arrayKey = key.substring(0, key.indexOf('['));
        const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
        
        if (!(arrayKey in current)) {
          current[arrayKey] = [];
        }
        if (!current[arrayKey][index]) {
          current[arrayKey][index] = {};
        }
        current = current[arrayKey][index];
      } else {
        if (!(key in current)) {
          current[key] = {};
        }
        current = current[key];
      }
    }
    
    const finalKey = keys[keys.length - 1];
    if (finalKey.includes('[') && finalKey.includes(']')) {
      const arrayKey = finalKey.substring(0, finalKey.indexOf('['));
      const index = parseInt(finalKey.substring(finalKey.indexOf('[') + 1, finalKey.indexOf(']')));
      
      if (!(arrayKey in current)) {
        current[arrayKey] = [];
      }
      current[arrayKey][index] = value;
    } else {
      current[finalKey] = value;
    }
  }

  /**
   * Extract a value from an object using a dynamic path
   * @param {Object} obj - The object to extract from
   * @param {string} path - The path string (e.g., "choices[0].message.content")
   * @returns {*} The extracted value or null if not found
   */
  static extractValueFromPath(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (key.includes('[') && key.includes(']')) {
        const arrayKey = key.substring(0, key.indexOf('['));
        const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
        current = current?.[arrayKey]?.[index];
      } else {
        current = current?.[key];
      }
      
      if (current === undefined || current === null) {
        return null;
      }
    }
    
    return current;
  }

  /**
   * Prepares request data (headers and body) for AI API calls
   * @param {Object} config - AI configuration object
   * @param {string} messageText - The message text to include
   * @param {Array} conversationHistory - Previous messages (optional)
   * @returns {Object} Object containing headers and requestBody
   */
  static prepareRequestData(config, messageText, conversationHistory = []) {
    // Prepare headers
    const headers = { ...config.headers };
    
    // Use API key directly (RSA decryption is handled at the User model level)
    let apiKey = config.apiKey;

    // Add API key to headers based on placement
    if (config.apiKeyPlacement === 'header' || !config.apiKeyPlacement) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (config.apiKeyPlacement === 'custom_header' && config.apiKeyHeader) {
      headers[config.apiKeyHeader] = apiKey;
    }

    // Ensure Content-Type header exists
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Prepare request body by cloning the template
    const requestBody = JSON.parse(JSON.stringify(config.requestTemplate));

    // Add API key to body if needed
    if (config.apiKeyPlacement === 'body' && config.apiKeyBodyPath) {
      this.setValueByPath(requestBody, config.apiKeyBodyPath, apiKey);
    }

    // Extract field names and default values
    const rolePath = config.requestRolePathFromGroup || 'role';
    const textPath = config.requestTextPathFromGroup || 'content';
    const userRoleValue = config.requestUserRoleField || 'user';
    const assistantRoleValue = config.requestAssistantField || 'assistant';

    // Create the message group and add conversation history
    if (config.requestMessageGroupPath && (conversationHistory.length > 0 || messageText)) {
      const messages = [];

      // Add previous messages
      if (conversationHistory && conversationHistory.length > 0) {
        for (const message of conversationHistory) {
          // Skip system messages
          if (message.role === 'system') {
            continue;
          }

          const messageObj = {};
          // Map the role values appropriately
          if (message.role === 'user') {
            messageObj[rolePath] = userRoleValue;
          } else if (message.role === 'assistant') {
            messageObj[rolePath] = assistantRoleValue;
          } else {
            // Use the role as is for any other roles
            messageObj[rolePath] = message.role;
          }

          messageObj[textPath] = message.content;
          messages.push(messageObj);
        }
      }

      // Add the new user message
      if (messageText) {
        const userMessage = {};
        userMessage[rolePath] = userRoleValue;
        userMessage[textPath] = messageText;
        messages.push(userMessage);
      }

      // Set the messages in the request body
      this.setValueByPath(requestBody, config.requestMessageGroupPath, messages);
    }

    return { headers, requestBody };
  }

  /**
   * Process AI response and extract content and thinking text
   * @param {string} responseStr - Raw response string from AI API
   * @param {Object} config - AI configuration object
   * @returns {Object} Object containing content and thinking
   */
  static processAiResponse(responseStr, config) {
    let responseMap;
    try {
      responseMap = JSON.parse(responseStr);
    } catch (error) {
      throw new Error('Invalid JSON response from AI service');
    }
    
    // Extract content using dynamic paths
    const content = this.extractValueFromPath(responseMap, config.responseTextPath);
    const thinking = config.responseThinkingTextPath ? 
      this.extractValueFromPath(responseMap, config.responseThinkingTextPath) : null;

    if (!content) {
      throw new Error('Could not extract response content from API response');
    }

    return { content, thinking, rawResponse: responseMap };
  }



  /**
   * Make HTTP POST request with proper error handling
   * @param {string} url - The URL to post to
   * @param {Object} headers - Request headers
   * @param {Object} requestBody - Request body
   * @param {number} timeout - Request timeout in ms
   * @returns {string} Response body as string
   */
  static async post(url, headers, requestBody, timeout = 30000) {
    const axios = require('axios');
    
    try {
      const response = await axios.post(url, requestBody, {
        headers,
        timeout
      });
      
      return JSON.stringify(response.data);
    } catch (error) {
      if (error.response) {
        // HTTP error response
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.code === 'ECONNABORTED') {
        // Timeout
        throw new Error('Request timeout');
      } else {
        // Network or other error
        throw new Error(`Network error: ${error.message}`);
      }
    }
  }

  /**
   * Make HTTP GET request with proper error handling
   * @param {string} url - The URL to get from
   * @param {Object} headers - Request headers
   * @param {number} timeout - Request timeout in ms
   * @returns {string} Response body as string
   */
  static async get(url, headers, timeout = 30000) {
    const axios = require('axios');
    
    try {
      const response = await axios.get(url, {
        headers,
        timeout
      });
      
      return JSON.stringify(response.data);
    } catch (error) {
      if (error.response) {
        // HTTP error response
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.code === 'ECONNABORTED') {
        // Timeout
        throw new Error('Request timeout');
      } else {
        // Network or other error
        throw new Error(`Network error: ${error.message}`);
      }
    }
  }
}

module.exports = HttpUtils; 