# Internationalization (i18n) Implementation

This document describes the comprehensive internationalization implementation for the Questions Party application, covering both frontend and backend components.

## Overview

The application supports multiple languages with seamless integration between frontend and backend. Currently supported languages:
- English (en) - Default
- Chinese (zh)

## Backend Internationalization

### Architecture

The backend i18n system consists of:

1. **Locale Files**: JSON files containing translations
2. **I18n Utility**: Core translation service
3. **I18n Middleware**: Request-level language detection and translation injection
4. **Controller Updates**: All controllers use localized messages

### File Structure

```
src/
├── locales/
│   ├── en.json          # English translations
│   └── zh.json          # Chinese translations
├── utils/
│   └── i18n.js          # Core i18n utility
├── middleware/
│   └── i18n.js          # I18n middleware
└── controllers/         # Updated with i18n support
```

### Language Detection Priority

The backend detects language in the following order:

1. **Query Parameter**: `?lang=zh` (for testing/debugging)
2. **User Preferences**: Authenticated user's saved language preference
3. **X-Language Header**: Custom header sent by frontend
4. **Accept-Language Header**: Standard browser language header
5. **Default**: Falls back to English (en)

### Usage in Controllers

Controllers can use the `req.t()` function for translations:

```javascript
// Simple translation
res.status(400).json({
  success: false,
  message: req.t('auth.invalidCredentials')
});

// Translation with parameters
res.status(400).json({
  success: false,
  message: req.t('auth.userWithFieldExists', { field: 'email' })
});
```

### API Endpoints

#### GET /api/i18n
Returns internationalization information:
```json
{
  "success": true,
  "locale": "zh",
  "supportedLocales": ["en", "zh"],
  "defaultLocale": "en",
  "detectedFromHeader": "zh"
}
```

#### GET /api/health
Health check with localized message:
```json
{
  "success": true,
  "message": "操作成功完成",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "locale": "zh",
  "services": {
    "database": "connected",
    "ai": "SiliconFlow/Qwen available"
  }
}
```

## Frontend Integration

### API Service

The frontend automatically sends language headers with every request:

```typescript
// src/services/api.ts
api.interceptors.request.use((config) => {
  const { locale } = useI18n()
  
  // Add language header
  if (locale.value) {
    config.headers['X-Language'] = locale.value
  }
  
  return config
})
```

### Store Updates

All Pinia stores have been updated to use the centralized API service:

```typescript
// Example from auth store
import { authAPI } from '../services/api'

const response = await authAPI.login(credentials)
// Language header is automatically included
```

## Translation Keys Structure

### Backend Translation Keys

```json
{
  "auth": {
    "userWithFieldExists": "User with this {{field}} already exists",
    "invalidCredentials": "Invalid credentials",
    "serverErrorLogin": "Server error during login"
  },
  "words": {
    "wordAlreadyExists": "Word already exists in your collection",
    "wordDeletedSuccessfully": "Word deleted successfully"
  },
  "generations": {
    "serverErrorGeneratingSentence": "Server error generating sentence",
    "generationNotFound": "Generation not found"
  },
  "aiConfig": {
    "configTestSuccessful": "Configuration test successful",
    "configNotFound": "AI configuration not found"
  },
  "common": {
    "serverError": "Internal server error",
    "badRequest": "Bad request",
    "success": "Operation completed successfully"
  }
}
```

### Parameter Interpolation

The system supports parameter interpolation using `{{parameter}}` syntax:

```javascript
// Backend
req.t('auth.userWithFieldExists', { field: 'email' })
// Result: "User with this email already exists"

// Chinese
req.t('auth.userWithFieldExists', { field: 'email' })
// Result: "此email的用户已存在"
```

## Testing

### Manual Testing

Use the provided test script:

```bash
cd questions-party-backend
node test-i18n.js
```

### Testing Different Languages

1. **Via Header**:
   ```bash
   curl -H "X-Language: zh" http://localhost:5000/api/health
   ```

2. **Via Accept-Language**:
   ```bash
   curl -H "Accept-Language: zh-CN,zh;q=0.9" http://localhost:5000/api/health
   ```

3. **Via Query Parameter**:
   ```bash
   curl http://localhost:5000/api/health?lang=zh
   ```

## Error Handling

All error responses include localized messages:

```json
{
  "success": false,
  "message": "用户凭证无效",
  "messageKey": "auth.invalidCredentials"
}
```

The `messageKey` field helps with debugging and frontend handling.

## Adding New Languages

### Backend

1. Create new locale file: `src/locales/[language].json`
2. Add language to supported locales in `src/utils/i18n.js`:
   ```javascript
   this.supportedLocales = ['en', 'zh', 'fr']; // Add 'fr' for French
   ```

### Frontend

1. Create new locale file: `src/locales/[language].json`
2. Update Vue i18n configuration to include the new language

## Best Practices

1. **Consistent Key Structure**: Use hierarchical keys (e.g., `auth.loginFailed`)
2. **Parameter Naming**: Use descriptive parameter names (`{{field}}`, `{{count}}`)
3. **Fallback Handling**: Always provide English translations as fallback
4. **Error Context**: Include both localized message and message key in responses
5. **Testing**: Test all language combinations for critical user flows

## Security Considerations

1. **Input Validation**: Language codes are validated against supported locales
2. **XSS Prevention**: All translation parameters are properly escaped
3. **Header Injection**: Custom headers are validated and sanitized

## Performance

1. **Caching**: Locale files are loaded once at startup
2. **Lazy Loading**: Frontend can implement lazy loading for additional languages
3. **Minimal Overhead**: Translation lookup is O(1) with object property access

## Troubleshooting

### Common Issues

1. **Missing Translations**: Check console for warnings about missing keys
2. **Wrong Language**: Verify header priority and user preferences
3. **Parameter Issues**: Ensure parameter names match between template and data

### Debug Mode

Enable debug mode by adding `?lang=en` or `?lang=zh` to any API endpoint to override all other language detection methods.

## Future Enhancements

1. **Pluralization**: Add support for plural forms
2. **Date/Number Formatting**: Locale-specific formatting
3. **RTL Support**: Right-to-left language support
4. **Dynamic Loading**: Load translations dynamically based on user preference
5. **Translation Management**: Admin interface for managing translations 