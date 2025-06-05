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
     * @param {string} locale - Locale ('en' or 'zh')
     * @returns {string} Prompt template
     */
    loadPrompt(type, locale = 'en') {
        const cacheKey = `${type}-${locale}`;
        
        // Return cached version if available
        if (this.promptCache.has(cacheKey)) {
            return this.promptCache.get(cacheKey);
        }

        try {
            const filename = `${type}-${locale}.txt`;
            const filepath = path.join(this.promptsDir, filename);
            
            if (!fs.existsSync(filepath)) {
                throw new Error(`Prompt file not found: ${filepath}`);
            }

            const promptTemplate = fs.readFileSync(filepath, 'utf8');
            
            // Cache the loaded prompt
            this.promptCache.set(cacheKey, promptTemplate);
            
            return promptTemplate;
        } catch (error) {
            console.error(`Error loading prompt ${type}-${locale}:`, error.message);
            
            // Fallback to English if Chinese version fails
            if (locale === 'zh') {
                console.warn(`Falling back to English prompt for ${type}`);
                return this.loadPrompt(type, 'en');
            }
            
            // If English also fails, throw error
            throw new Error(`Failed to load prompt template: ${type}-${locale}`);
        }
    }

    /**
     * Get sentence check prompt with replacements
     * @param {string} sentence - Sentence to analyze
     * @param {string} grammarLanguageOption - Language option ('combined' or 'pure')
     * @param {string} locale - Locale ('en' or 'zh')
     * @returns {string} Formatted prompt
     */
    getSentenceCheckPrompt(sentence, grammarLanguageOption = 'combined', locale = 'en') {
        const template = this.loadPrompt('sentence-check', locale);
        
        const languageInstruction = this.getLanguageInstruction(grammarLanguageOption, locale);
        
        return template
            .replace('{sentence}', sentence)
            .replace('{languageInstruction}', languageInstruction);
    }

    /**
     * Get sentence generation prompt with replacements
     * @param {Array} words - Array of words to use
     * @param {string} grammarLanguageOption - Language option ('combined' or 'pure')
     * @param {string} locale - Locale ('en' or 'zh')
     * @returns {string} Formatted prompt
     */
    getSentenceGenerationPrompt(words, grammarLanguageOption = 'combined', locale = 'en') {
        const template = this.loadPrompt('sentence-generation', locale);
        
        const languageInstruction = this.getLanguageInstruction(grammarLanguageOption, locale);
        const wordsString = Array.isArray(words) ? words.join(', ') : words;
        
        return template
            .replace('{words}', wordsString)
            .replace('{languageInstruction}', languageInstruction);
    }

    /**
     * Get language instruction based on option and locale
     * @param {string} grammarLanguageOption - Language option ('combined' or 'pure')
     * @param {string} locale - Locale ('en' or 'zh')
     * @returns {string} Language instruction
     */
    getLanguageInstruction(grammarLanguageOption, locale) {
        const isEnglishOnly = grammarLanguageOption === 'pure';
        
        if (locale === 'zh') {
            return isEnglishOnly
                ? "仅用英语提供解释。"
                : "用英语和中文提供解释。";
        } else {
            return isEnglishOnly
                ? "Provide explanations in English only."
                : "Provide explanations in both English and Chinese.";
        }
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
            'sentence-check-en.txt',
            'sentence-check-zh.txt',
            'sentence-generation-en.txt',
            'sentence-generation-zh.txt'
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