# AI Prompt System

This directory contains the modular prompt templates used by the AI service for generating responses. The prompts are separated into different files based on grammar language options to allow for easy maintenance and customization.

## File Structure

```
src/prompts/
├── sentence-check-pure.txt        # English-only template for sentence checking
├── sentence-check-combined.txt    # Bilingual (English + Chinese) template for sentence checking
├── sentence-generation-pure.txt   # English-only template for sentence generation
├── sentence-generation-combined.txt  # Bilingual (English + Chinese) template for sentence generation
└── README.md                      # This documentation file
```

## Template Variables

Each prompt template supports variable substitution:

### Sentence Check Templates
- `{sentence}` - The sentence to be analyzed

### Sentence Generation Templates
- `{words}` - Comma-separated list of words to use in the sentence

## Grammar Language Options

### Pure Templates (`-pure.txt`)
- Provide explanations in English only
- Use English instructions and examples
- Maintain consistent formatting with markdown-style headers
- Follow the exact parsing format expected by the response parser

### Combined Templates (`-combined.txt`)
- Provide explanations in both English and Chinese
- Use Chinese instructions at the top, bilingual content in sections
- Include Chinese translations and explanations alongside English content
- Maintain the same structural markers for parsing compatibility

## Usage in Code

The prompt loader utility (`src/utils/promptLoader.js`) handles:
- Loading and caching prompt templates based on grammar language option
- Variable substitution
- Fallback to combined version if pure version fails
- Validation of prompt file availability

### Example Usage

```javascript
const promptLoader = require('../utils/promptLoader');

// Load English-only sentence check prompt
const prompt = promptLoader.getSentenceCheckPrompt(
    'She reads books',
    'pure'
);

// Load bilingual sentence generation prompt
const prompt = promptLoader.getSentenceGenerationPrompt(
    ['quick', 'brown', 'fox'],
    'combined'
);
```

## Adding New Prompts

1. Create new template files following the naming convention: `{type}-{option}.txt`
2. Update the `promptLoader.js` validation method to include new files
3. Add new methods to the prompt loader for the specific prompt type
4. Update the AI service to use the new prompts

## Best Practices

1. **Consistency**: Keep the same structural markers across all grammar language versions
2. **Formatting**: Maintain consistent markdown formatting and indentation
3. **Examples**: Use clear, educational examples that demonstrate the concept
4. **Language Balance**: In combined templates, balance English and Chinese content for maximum educational value
5. **Testing**: Always test prompt changes with the actual AI service

## Cache Management

The prompt loader includes caching functionality:
- Prompts are cached after first load for performance
- Cache can be cleared during development: `promptLoader.clearCache()`
- Cache status can be checked: `promptLoader.getCacheInfo()` 