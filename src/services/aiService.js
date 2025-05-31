const axios = require('axios');
const config = require('../../config/config');

class AIService {
  constructor() {
    this.openaiClient = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
  }

  async generateSentence(words) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = `You are an English language tutor. Create a single, natural sentence that incorporates ALL of the following words: ${words.join(', ')}

Requirements:
1. Use ALL provided words naturally in the sentence
2. The sentence should be grammatically correct and meaningful
3. Provide a detailed syntax explanation

Return your response in this exact JSON format:
{
  "sentence": "Your generated sentence here",
  "explanation": "Detailed syntax explanation including parts of speech, sentence structure, and why each word fits grammatically"
}

Words to include: ${words.join(', ')}`;

    try {
      const response = await this.openaiClient.post('/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful English language tutor. Always respond with valid JSON in the requested format.' 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        max_tokens: 800,
        temperature: 0.7,
        presence_penalty: 0.1
      });

      const content = response.data.choices[0].message.content.trim();
      
      // Try to parse JSON response
      try {
        const result = JSON.parse(content);
        
        // Validate required fields
        if (!result.sentence || !result.explanation) {
          throw new Error('Invalid AI response format');
        }
        
        return {
          sentence: result.sentence.trim(),
          explanation: result.explanation.trim()
        };
      } catch (parseError) {
        throw new Error('Invalid JSON response from AI service');
      }
    } catch (error) {
      if (error.response) {
        // OpenAI API error
        const status = error.response.status;
        const message = error.response.data?.error?.message || 'OpenAI API error';
        
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (status === 401) {
          throw new Error('Invalid OpenAI API key');
        } else if (status === 400) {
          throw new Error('Invalid request to OpenAI API');
        } else {
          throw new Error(`OpenAI API error: ${message}`);
        }
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Unable to connect to OpenAI API');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout to OpenAI API');
      } else {
        throw new Error(`AI service error: ${error.message}`);
      }
    }
  }

  // Method to validate words before sending to AI
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