const crypto = require('crypto');

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
    
    // Handle API key decryption if needed
    let apiKey = config.apiKey;
    if (apiKey && apiKey.startsWith('enc:') && config.secretKey) {
      try {
        apiKey = this.decryptApiKey(apiKey.substring(4), config.secretKey);
      } catch (error) {
        throw new Error(`Failed to decrypt API key: ${error.message}`);
      }
    }

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
   * Decrypt an API key using AES decryption (CryptoJS compatible)
   * @param {string} encryptedApiKey - The encrypted API key
   * @param {string} secretKey - The secret key for decryption
   * @returns {string} The decrypted API key
   */
  static decryptApiKey(encryptedApiKey, secretKey) {
    try {
      // CryptoJS uses OpenSSL format which includes salt
      const cipherData = Buffer.from(encryptedApiKey, 'base64');
      
      // CryptoJS format: "Salted__" + 8 byte salt + actual ciphertext
      const saltBytes = cipherData.slice(8, 16);
      const cipherBytes = cipherData.slice(16);
      
      // Generate key and IV using OpenSSL EVP_BytesToKey derivation
      const { key, iv } = this.evpBytesToKey(secretKey, saltBytes);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(cipherBytes);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Implementation of OpenSSL's EVP_BytesToKey key derivation function
   * @param {string} password - The password
   * @param {Buffer} salt - The salt bytes
   * @returns {Object} Object containing key and iv
   */
  static evpBytesToKey(password, salt) {
    const keyLen = 32; // 256 bits
    const ivLen = 16;  // 128 bits
    
    let derivedBytes = Buffer.alloc(0);
    let block = null;
    
    while (derivedBytes.length < keyLen + ivLen) {
      const hash = crypto.createHash('md5');
      if (block) {
        hash.update(block);
      }
      hash.update(password, 'utf8');
      hash.update(salt);
      block = hash.digest();
      derivedBytes = Buffer.concat([derivedBytes, block]);
    }
    
    return {
      key: derivedBytes.slice(0, keyLen),
      iv: derivedBytes.slice(keyLen, keyLen + ivLen)
    };
  }
}

module.exports = HttpUtils; 