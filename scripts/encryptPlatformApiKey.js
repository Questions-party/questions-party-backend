#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateKeyPair } = require('../src/utils/rsaCrypto');

// Configuration
const envPath = path.join(__dirname, '../.env');

// Function to parse .env file
function parseEnvFile(filePath) {
  const envVars = {};
  
  if (!fs.existsSync(filePath)) {
    return envVars;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envVars[key.trim()] = value;
      }
    }
  }
  
  return envVars;
}

// Read existing .env file and get API key
const existingEnvVars = parseEnvFile(envPath);
const platformApiKey = existingEnvVars.SILICONFLOW_API_KEY || 'sk-your-platform-api-key-here';

async function encryptPlatformApiKey() {
  try {
    console.log('🔑 Platform API Key Encryption Script');
    console.log('=====================================');

    // Check if platform API key is provided
    if (platformApiKey === 'sk-your-platform-api-key-here') {
      console.error('❌ Please set SILICONFLOW_API_KEY in your .env file');
      console.error('   Add this line to your .env file: SILICONFLOW_API_KEY=sk-your-actual-api-key');
      process.exit(1);
    }

    // Check for existing RSA keys in .env file
    let publicKeyPEM, privateKeyPEM;
    
    if (existingEnvVars.RSA_PUBLIC_KEY && existingEnvVars.RSA_PRIVATE_KEY) {
      console.log('🔍 Found existing RSA keys in .env file, using them...');
      publicKeyPEM = existingEnvVars.RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
      privateKeyPEM = existingEnvVars.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
      console.log('✅ Using existing RSA key pair');
    } else {
      console.log('🔄 No existing RSA keys found, generating new RSA key pair...');
      const keyPair = generateKeyPair(2048);
      publicKeyPEM = keyPair.publicKeyPEM;
      privateKeyPEM = keyPair.privateKeyPEM;
      console.log('✅ New RSA key pair generated successfully');
    }

    // Encrypt the platform API key using the public key
    console.log('🔒 Encrypting platform API key...');
    const buffer = Buffer.from(platformApiKey, 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPEM,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    const encryptedApiKey = encrypted.toString('base64');
    
    console.log('✅ Platform API key encrypted successfully');

    // Use existing .env content
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      console.log('📄 Existing .env file found, will update it');
    } else {
      console.log('📄 .env file not found - this should not happen since we read the API key from it');
      console.log('📄 Creating new .env file');
    }

    // Prepare new environment variables
    const newEnvVars = {
      RSA_PUBLIC_KEY: publicKeyPEM.replace(/\n/g, '\\n'),
      RSA_PRIVATE_KEY: privateKeyPEM.replace(/\n/g, '\\n'),
      ENCRYPTED_PLATFORM_API_KEY: 'rsa:' + encryptedApiKey
    };

    // Update or add environment variables
    let updatedEnvContent = envContent;
    
    for (const [key, value] of Object.entries(newEnvVars)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const newLine = `${key}="${value}"`;
      
      if (regex.test(updatedEnvContent)) {
        updatedEnvContent = updatedEnvContent.replace(regex, newLine);
        console.log(`🔄 Updated ${key} in .env file`);
      } else {
        updatedEnvContent += updatedEnvContent.endsWith('\n') ? '' : '\n';
        updatedEnvContent += newLine + '\n';
        console.log(`➕ Added ${key} to .env file`);
      }
    }

    // Write updated .env file
    fs.writeFileSync(envPath, updatedEnvContent);
    console.log('💾 .env file updated successfully');

    console.log('\n🎉 Platform API key encryption completed!');
    console.log('\n📋 Summary:');
    const keyAction = existingEnvVars.RSA_PUBLIC_KEY && existingEnvVars.RSA_PRIVATE_KEY ? 'used existing' : 'generated new';
    console.log(`   • RSA key pair ${keyAction} and stored in .env`);
    console.log(`   • Platform API key encrypted and stored as ENCRYPTED_PLATFORM_API_KEY`);
    console.log(`   • Original API key: ${platformApiKey.substring(0, 10)}...`);
    console.log(`   • Encrypted length: ${encryptedApiKey.length} characters`);
    
    console.log('\n⚠️  Important Security Notes:');
    console.log('   • Keep your .env file secure and never commit it to version control');
    console.log('   • The RSA private key is used to decrypt API keys');
    console.log('   • Store backups of your keys securely');

    // Test decryption
    console.log('\n🧪 Testing decryption...');
    
    // Restore original line breaks for testing
    const testPrivateKey = newEnvVars.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    
         // Test decryption directly
     let decryptedKey;
     try {
       const encryptedBuffer = Buffer.from(encryptedApiKey, 'base64');
       decryptedKey = crypto.privateDecrypt(
         {
           key: testPrivateKey,
           padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
           oaepHash: 'sha256'
         },
         encryptedBuffer
       ).toString('utf8');
     } catch (decryptError) {
       console.error('❌ Decryption test failed:', decryptError.message);
       decryptedKey = null;
     }
    
    if (decryptedKey && decryptedKey === platformApiKey) {
      console.log('✅ Decryption test passed - API key can be successfully decrypted');
    } else {
      console.log('❌ Decryption test failed - there may be an issue with the encryption');
      console.log(`Expected: ${platformApiKey}`);
      console.log(`Got: ${decryptedKey || 'null'}`);
    }

  } catch (error) {
    console.error('❌ Error encrypting platform API key:', error.message);
    process.exit(1);
  }
}

// Helper function to display usage
function showUsage() {
  console.log('Usage:');
  console.log('  node encryptPlatformApiKey.js');
  console.log('');
  console.log('Prerequisites:');
  console.log('  Add SILICONFLOW_API_KEY to your .env file');
  console.log('');
  console.log('Example .env file:');
  console.log('  SILICONFLOW_API_KEY=sk-your-actual-api-key');
  console.log('');
  console.log('The script will:');
  console.log('  1. Read your API key from .env file');
  console.log('  2. Use existing RSA keys or generate new ones if not found');
  console.log('  3. Encrypt the API key');
  console.log('  4. Update .env file with encrypted data');
}

// Check command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the script
encryptPlatformApiKey().catch(console.error); 