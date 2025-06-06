# RSA Encryption Setup for API Keys

This document explains how to set up and use RSA-OAEP encryption for API keys in the Questions Party application.

## Overview

The application uses RSA-OAEP encryption to secure API keys:
- **Frontend**: Encrypts API keys using RSA public key before sending to backend
- **Backend**: Stores encrypted API keys in MongoDB and decrypts them only when needed for AI service calls
- **Platform API Key**: Can be encrypted and stored in environment variables

## Setup Instructions

### 1. Generate RSA Key Pair and Encrypt Platform API Key

Run the encryption script to generate RSA keys and encrypt your platform API key:

```bash
# Navigate to the backend directory
cd questions-party-backend

# Set your platform API key as environment variable
export SILICONFLOW_API_KEY="sk-your-actual-api-key-here"

# Run the encryption script
node scripts/encryptPlatformApiKey.js
```

This script will:
- Generate a new RSA-2048 key pair
- Encrypt your platform API key
- Update the `.env` file with the keys and encrypted API key
- Test the encryption/decryption to ensure it works

### 2. Environment Variables

After running the script, your `.env` file should contain:

```env
# RSA encryption keys
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----"

# Encrypted platform API key
ENCRYPTED_PLATFORM_API_KEY="rsa:base64-encrypted-data-here"

# Optional: Keep the original for fallback
SILICONFLOW_API_KEY="sk-your-api-key"
```

### 3. Security Best Practices

- **Never commit** your `.env` file to version control
- **Backup** your RSA keys securely
- **Rotate** keys periodically for enhanced security
- **Monitor** API key usage for suspicious activity

## How It Works

### Frontend Encryption Flow

1. User enters API key in the frontend
2. Frontend fetches RSA public key from `/api/auth/public-key`
3. API key is encrypted using RSA-OAEP with the public key
4. Encrypted key (with `rsa:` prefix) is sent to backend
5. Backend stores the encrypted key in MongoDB

```typescript
// Frontend encryption example
const response = await aiConfigAPI.getPublicKey();
const publicKey = response.data.publicKey;
rsaCrypto.setPublicKey(publicKey);
const encrypted = rsaCrypto.encrypt(apiKey);
const encryptedWithPrefix = 'rsa:' + encrypted;
```

### Backend Decryption Flow

1. When AI service needs API key, it calls `user.getDecryptedApiKey()`
2. User model checks if key has `rsa:` prefix
3. If encrypted, it removes prefix and decrypts using RSA private key
4. Decrypted key is used for AI service calls
5. Key is never stored in plaintext

```javascript
// Backend decryption example
userSchema.methods.decryptApiKey = function(encryptedKey = null) {
  const keyToDecrypt = encryptedKey || this.apiKey;
  
  if (keyToDecrypt.startsWith('rsa:')) {
    const encryptedData = keyToDecrypt.substring(4);
    return rsaDecrypt(encryptedData);
  }
  
  return keyToDecrypt; // Fallback for non-encrypted keys
};
```

## API Endpoints

### Get Public Key
```
GET /api/auth/public-key
```
Returns the RSA public key for frontend encryption.

### Update API Key
```
PUT /api/auth/api-key
Body: {
  "apiKey": "rsa:encrypted-data-here",
  "useCustomApiKey": true
}
```
Stores the encrypted API key for the user.

### Test API Key
```
POST /api/auth/test-api-key
Body: {
  "apiKey": "plaintext-api-key-for-testing"
}
```
Tests an API key without storing it (expects plaintext).

## File Structure

```
src/
├── utils/
│   └── rsaCrypto.js          # RSA encryption/decryption utilities
├── models/
│   └── User.js               # User model with API key decryption methods
├── controllers/
│   └── authController.js     # API key management endpoints
├── services/
│   └── aiService.js          # AI service with key decryption
└── routes/
    └── auth.js               # Authentication routes

scripts/
└── encryptPlatformApiKey.js  # Platform key encryption script

tests/
└── rsaCrypto.test.js         # RSA encryption tests
```

## Testing

### Run Backend Tests
```bash
# Test RSA encryption functionality
node tests/rsaCrypto.test.js
```

### Run Frontend Tests
```bash
# In browser console after loading the app
import { runFrontendTests } from './src/utils/rsaCrypto.test.ts';
runFrontendTests();
```

### Manual Testing
```bash
# Test the platform key encryption script
SILICONFLOW_API_KEY="sk-test" node scripts/encryptPlatformApiKey.js

# Test with help
node scripts/encryptPlatformApiKey.js --help
```

## Troubleshooting

### Key Generation Issues
- Ensure `jsrsasign` is installed: `npm install jsrsasign`
- Check Node.js version (requires Node.js 14+)

### Encryption/Decryption Errors
- Verify RSA keys are properly formatted in `.env`
- Check that `\n` sequences are correctly escaped in environment variables
- Ensure public/private key pair match

### Frontend Issues
- Verify public key is fetched successfully
- Check browser console for encryption errors
- Ensure `jsrsasign` is included in frontend dependencies

### API Key Not Working
- Test API key directly with the AI service
- Check if platform encrypted key is being decrypted correctly
- Verify user's custom key encryption/decryption

## Migration from Previous Encryption

**Note:** Legacy AES encryption support has been removed. All API keys now use RSA encryption exclusively.

For users with previously encrypted API keys:
1. Users will need to re-enter their API keys 
2. New API key updates automatically use RSA encryption
3. Old AES-encrypted keys are no longer supported

## Security Considerations

### RSA Key Security
- RSA private key provides access to all encrypted API keys
- Use strong key storage practices in production
- Consider key rotation policies
- Monitor key usage and access

### API Key Handling
- API keys are decrypted only when needed for AI calls
- Decrypted keys are not logged or stored
- Network transmission uses HTTPS
- Frontend encryption prevents plaintext storage

### Production Deployment
- Use environment-specific encryption keys
- Implement key management best practices
- Set up monitoring for encryption failures
- Plan for key rotation procedures

## Support

For issues related to RSA encryption:
1. Check the test suite output
2. Review environment variable configuration
3. Verify key pair generation
4. Test with known good API keys

For additional help, refer to the main application documentation or create an issue in the project repository. 