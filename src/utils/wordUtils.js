const Typo = require('typo-js');
const WordNet = require('wordnet');

// Initialize the spell checker
let spellChecker;
try {
  spellChecker = new Typo('en_US');
} catch (error) {
  console.error('Failed to initialize spell checker:', error);
}

// Initialize WordNet
let wordnet;
try {
  wordnet = new WordNet();
} catch (error) {
  console.error('Failed to initialize WordNet:', error);
}

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
  return new Promise((resolve) => {
    if (!wordnet) {
      console.warn('WordNet not available');
      resolve({
        definitions: [],
        primaryDefinition: null,
        primaryPartOfSpeech: null,
        wordNetProcessed: false
      });
      return;
    }

    try {
      const cleanWord = word.toLowerCase().trim();
      
      wordnet.lookup(cleanWord, (err, definitions) => {
        if (err || !definitions || definitions.length === 0) {
          console.log(`No WordNet data found for: ${cleanWord}`);
          resolve({
            definitions: [],
            primaryDefinition: null,
            primaryPartOfSpeech: null,
            wordNetProcessed: true
          });
          return;
        }

        // Process WordNet definitions
        const processedDefinitions = definitions.map(def => ({
          text: def.def || def.gloss || '',
          partOfSpeech: mapWordNetPoS(def.pos)
        })).filter(def => def.text && def.partOfSpeech);

        // Get primary (first/most common) definition and part of speech
        const primaryDefinition = processedDefinitions.length > 0 ? processedDefinitions[0].text : null;
        const primaryPartOfSpeech = processedDefinitions.length > 0 ? processedDefinitions[0].partOfSpeech : null;

        resolve({
          definitions: processedDefinitions.slice(0, 10), // Limit to 10 definitions
          primaryDefinition,
          primaryPartOfSpeech,
          wordNetProcessed: true
        });
      });
    } catch (error) {
      console.error('Error looking up word in WordNet:', error);
      resolve({
        definitions: [],
        primaryDefinition: null,
        primaryPartOfSpeech: null,
        wordNetProcessed: true
      });
    }
  });
};

/**
 * Map WordNet part of speech codes to our schema values
 * @param {string} wordnetPos - WordNet part of speech code
 * @returns {string|null} - Mapped part of speech or null if not supported
 */
const mapWordNetPoS = (wordnetPos) => {
  const mapping = {
    'n': 'noun',
    'v': 'verb',
    'a': 'adjective',
    's': 'adjective satellite',
    'r': 'adverb'
  };

  return mapping[wordnetPos] || null;
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