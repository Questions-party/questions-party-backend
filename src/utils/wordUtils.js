const Typo = require('typo-js');
const wordnet = require('wordnet');

// Initialize the spell checker
let spellChecker;
try {
  spellChecker = new Typo('en_US');
} catch (error) {
  console.error('Failed to initialize spell checker:', error);
}

// Initialize WordNet
let wordnetInitialized = false;
const initializeWordNet = async () => {
  if (!wordnetInitialized) {
    try {
      await wordnet.init();
      wordnetInitialized = true;
      console.log('WordNet initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WordNet:', error);
    }
  }
};

/**
 * Check if a word is spelled correctly
 * @param {string} word - The word to check
 * @returns {boolean} - True if the word is spelled correctly
 */
const isWordSpelledCorrectly = (word) => {
  if (!spellChecker) {
    console.warn('Spell checker not available, assuming word is correct');
    return true;
  }

  try {
    const cleanWord = word.toLowerCase().trim();
    return spellChecker.check(cleanWord);
  } catch (error) {
    console.error('Error checking spelling:', error);
    return true; // Default to true if there's an error
  }
};

/**
 * Get spelling suggestions for a word
 * @param {string} word - The word to get suggestions for
 * @returns {string[]} - Array of suggested spellings
 */
const getSpellingSuggestions = (word) => {
  if (!spellChecker) {
    return [];
  }

  try {
    const cleanWord = word.toLowerCase().trim();
    return spellChecker.suggest(cleanWord) || [];
  } catch (error) {
    console.error('Error getting spelling suggestions:', error);
    return [];
  }
};

/**
 * Get word definitions and parts of speech from WordNet
 * @param {string} word - The word to look up
 * @returns {Promise<Object>} - Object containing definitions and primary info
 */
const getWordNetData = async (word) => {
  try {
    // Ensure WordNet is initialized
    await initializeWordNet();
    
    if (!wordnetInitialized) {
      console.warn('WordNet not available');
      return {
        definitions: [],
        primaryDefinition: null,
        primaryPartOfSpeech: null,
        wordNetProcessed: false
      };
    }

    const cleanWord = word.toLowerCase().trim();
    
    try {
      const definitions = await wordnet.lookup(cleanWord);
      
      if (!definitions || definitions.length === 0) {
        console.log(`No WordNet data found for: ${cleanWord}`);
        return {
          definitions: [],
          primaryDefinition: null,
          primaryPartOfSpeech: null,
          wordNetProcessed: true
        };
      }

      // Process WordNet definitions
      const processedDefinitions = definitions.map(def => ({
        text: def.glossary || def.gloss || '',
        partOfSpeech: mapWordNetPoS(def.meta?.synsetType)
      })).filter(def => def.text && def.partOfSpeech);

      // Get primary (first/most common) definition and part of speech
      const primaryDefinition = processedDefinitions.length > 0 ? processedDefinitions[0].text : null;
      const primaryPartOfSpeech = processedDefinitions.length > 0 ? processedDefinitions[0].partOfSpeech : null;

      return {
        definitions: processedDefinitions.slice(0, 10), // Limit to 10 definitions
        primaryDefinition,
        primaryPartOfSpeech,
        wordNetProcessed: true
      };
    } catch (lookupError) {
      console.error('Error looking up word in WordNet:', lookupError);
      return {
        definitions: [],
        primaryDefinition: null,
        primaryPartOfSpeech: null,
        wordNetProcessed: true
      };
    }
  } catch (error) {
    console.error('Error in getWordNetData:', error);
    return {
      definitions: [],
      primaryDefinition: null,
      primaryPartOfSpeech: null,
      wordNetProcessed: false
    };
  }
};

/**
 * Map WordNet part of speech codes to our schema values
 * @param {string} wordnetPos - WordNet part of speech code
 * @returns {string|null} - Mapped part of speech or null if not supported
 */
const mapWordNetPoS = (wordnetPos) => {
  if (!wordnetPos) return null;
  
  const mapping = {
    'noun': 'noun',
    'verb': 'verb',
    'adjective': 'adjective',
    'adverb': 'adverb',
    'n': 'noun',
    'v': 'verb',
    'a': 'adjective',
    's': 'adjective', // adjective satellite
    'r': 'adverb'
  };

  return mapping[wordnetPos.toLowerCase()] || null;
};

/**
 * Process a word: check spelling and get WordNet data
 * @param {string} word - The word to process
 * @returns {Promise<Object>} - Processing result
 */
const processWord = async (word) => {
  const cleanWord = word.toLowerCase().trim();
  
  // Check spelling first
  const isSpelledCorrectly = isWordSpelledCorrectly(cleanWord);
  
  if (!isSpelledCorrectly) {
    const suggestions = getSpellingSuggestions(cleanWord);
    return {
      success: false,
      error: 'SPELLING_ERROR',
      suggestions,
      word: cleanWord
    };
  }

  // Get WordNet data
  const wordNetData = await getWordNetData(cleanWord);
  
  return {
    success: true,
    word: cleanWord,
    ...wordNetData
  };
};

module.exports = {
  isWordSpelledCorrectly,
  getSpellingSuggestions,
  getWordNetData,
  processWord
}; 