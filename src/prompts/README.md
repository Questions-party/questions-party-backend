# AI Prompt System

This directory contains the modular prompt templates used by the AI service for generating responses. The prompts are separated into different files to allow for easy maintenance and multi-language support.

## File Structure

```
src/prompts/
├── sentence-check-en.txt       # English template for sentence checking
├── sentence-check-zh.txt       # Chinese template for sentence checking
├── sentence-generation-en.txt  # English template for sentence generation
├── sentence-generation-zh.txt  # Chinese template for sentence generation
└── README.md                   # This documentation file
```

## Template Variables

Each prompt template supports variable substitution:

### Sentence Check Templates
- `{sentence}` - The sentence to be analyzed
- `{languageInstruction}` - Dynamic instruction based on grammar language option

### Sentence Generation Templates
- `{words}` - Comma-separated list of words to use in the sentence
- `{languageInstruction}` - Dynamic instruction based on grammar language option

## Language Support

### English Templates (`-en.txt`)
- Use English instructions and examples
- Maintain consistent formatting with markdown-style headers
- Follow the exact parsing format expected by the response parser

### Chinese Templates (`-zh.txt`)
- Use Chinese instructions and examples
- Translate section headers (e.g., "**Subject Analysis**" → "**主语分析**")
- Maintain the same structural markers for parsing compatibility
- Provide Chinese explanations while keeping English examples for consistency

## Usage in Code

The prompt loader utility (`src/utils/promptLoader.js`) handles:
- Loading and caching prompt templates
- Variable substitution
- Fallback to English if Chinese templates fail
- Validation of prompt file availability

### Example Usage

```javascript
const promptLoader = require('../utils/promptLoader');

// Load English sentence check prompt
const prompt = promptLoader.getSentenceCheckPrompt(
    'She reads books',
    'combined',
    'en'
);

// Load Chinese sentence generation prompt
const prompt = promptLoader.getSentenceGenerationPrompt(
    ['quick', 'brown', 'fox'],
    'pure',
    'zh'
);
```

## Adding New Prompts

1. Create new template files following the naming convention: `{type}-{locale}.txt`
2. Update the `promptLoader.js` validation method to include new files
3. Add new methods to the prompt loader for the specific prompt type
4. Update the AI service to use the new prompts

## Best Practices

1. **Consistency**: Keep the same structural markers across all language versions
2. **Formatting**: Maintain consistent markdown formatting and indentation
3. **Examples**: Use clear, educational examples that demonstrate the concept
4. **Translation**: When translating, focus on clarity and educational value
5. **Testing**: Always test prompt changes with the actual AI service

## Cache Management

The prompt loader includes caching functionality:
- Prompts are cached after first load for performance
- Cache can be cleared during development: `promptLoader.clearCache()`
- Cache status can be checked: `promptLoader.getCacheInfo()` 