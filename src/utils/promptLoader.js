const fs = require('fs');
const path = require('path');

class PromptLoader {
    constructor() {
        this.promptCache = new Map();
        this.promptsDir = path.join(__dirname, '../prompts');
    }

    /**
     * Load a prompt template from file with caching
     * @param {string} type - Type of prompt ('sentence-check' or 'sentence-generation')
     * @param {string} grammarLanguageOption - Grammar language option ('combined' or 'pure')
     * @returns {string} Prompt template
     */
    loadPrompt(type, grammarLanguageOption = 'combined') {
        const cacheKey = `${type}-${grammarLanguageOption}`;
        
        // Return cached version if available
        if (this.promptCache.has(cacheKey)) {
            return this.promptCache.get(cacheKey);
        }

        try {
            const filename = `${type}-${grammarLanguageOption}.txt`;
            const filepath = path.join(this.promptsDir, filename);
            
            if (!fs.existsSync(filepath)) {
                throw new Error(`Prompt file not found: ${filepath}`);
            }

            const promptTemplate = fs.readFileSync(filepath, 'utf8');
            
            // Cache the loaded prompt
            this.promptCache.set(cacheKey, promptTemplate);
            
            return promptTemplate;
        } catch (error) {
            console.error(`Error loading prompt ${type}-${grammarLanguageOption}:`, error.message);
            
            // Fallback to combined version if pure version fails
            if (grammarLanguageOption === 'pure') {
                console.warn(`Falling back to combined prompt for ${type}`);
                return this.loadPrompt(type, 'combined');
            }
            
            // If combined also fails, throw error
            throw new Error(`Failed to load prompt template: ${type}-${grammarLanguageOption}`);
        }
    }

    /**
     * Get sentence check prompt with replacements
     * @param {string} sentence - Sentence to analyze
     * @param {string} grammarLanguageOption - Language option ('combined' or 'pure')
     * @returns {string} Formatted prompt
     */
    getSentenceCheckPrompt(sentence, grammarLanguageOption = 'combined') {
        const template = this.loadPrompt('sentence-check', grammarLanguageOption);
        
        return template.replace('{sentence}', sentence);
    }

    /**
     * Get sentence generation prompt with replacements
     * @param {Array} words - Array of words to use
     * @param {string} grammarLanguageOption - Language option ('combined' or 'pure')
     * @returns {string} Formatted prompt
     */
    getSentenceGenerationPrompt(words, grammarLanguageOption = 'combined') {
        const template = this.loadPrompt('sentence-generation', grammarLanguageOption);
        
        const wordsString = Array.isArray(words) ? words.join(', ') : words;
        
        return template.replace('{words}', wordsString);
    }

    /**
     * Clear the prompt cache (useful for development/testing)
     */
    clearCache() {
        this.promptCache.clear();
    }

    /**
     * Get cache status for debugging
     * @returns {Object} Cache information
     */
    getCacheInfo() {
        return {
            cacheSize: this.promptCache.size,
            cachedPrompts: Array.from(this.promptCache.keys())
        };
    }

    /**
     * Validate that all required prompt files exist
     * @returns {Object} Validation result
     */
    validatePromptFiles() {
        const requiredPrompts = [
            'sentence-check-pure.txt',
            'sentence-check-combined.txt',
            'sentence-generation-pure.txt',
            'sentence-generation-combined.txt'
        ];

        const missing = [];
        const existing = [];

        for (const filename of requiredPrompts) {
            const filepath = path.join(this.promptsDir, filename);
            if (fs.existsSync(filepath)) {
                existing.push(filename);
            } else {
                missing.push(filename);
            }
        }

        return {
            valid: missing.length === 0,
            existing,
            missing,
            promptsDirectory: this.promptsDir
        };
    }
}

module.exports = new PromptLoader(); 