const { RSACrypto, generateKeyPair, encrypt, decrypt, encryptWithPublicKey, validateKey } = require('../src/utils/rsaCrypto');

// Test data
const testApiKey = 'sk-test-api-key-12345678901234567890';
const testMessages = [
  'Hello World!',
  'This is a test API key',
  testApiKey,
  '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`',
  'MultiLine\nText\nWith\nBreaks',
  'Unicode: 你好世界 🌍 éñçødîñg',
  '', // Empty string test
];

console.log('🧪 RSA Crypto Test Suite');
console.log('========================\n');

async function runTests() {
  let passedTests = 0;
  let totalTests = 0;

  function test(name, testFn) {
    totalTests++;
    try {
      const result = testFn();
      if (result === true || result === undefined) {
        console.log(`✅ ${name}`);
        passedTests++;
      } else {
        console.log(`❌ ${name}: ${result}`);
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  function asyncTest(name, testFn) {
    totalTests++;
    return testFn()
      .then((result) => {
        if (result === true || result === undefined) {
          console.log(`✅ ${name}`);
          passedTests++;
        } else {
          console.log(`❌ ${name}: ${result}`);
        }
      })
      .catch((error) => {
        console.log(`❌ ${name}: ${error.message}`);
      });
  }

  // Test 1: Key Generation
  console.log('🔑 Testing Key Generation...');
  test('Generate RSA key pair', () => {
    const keyPair = generateKeyPair();
    if (!keyPair.publicKeyPEM || !keyPair.privateKeyPEM) {
      return 'Key pair generation failed';
    }
    if (!keyPair.publicKeyPEM.includes('BEGIN PUBLIC KEY')) {
      return 'Invalid public key format';
    }
    if (!keyPair.privateKeyPEM.includes('BEGIN PRIVATE KEY')) {
      return 'Invalid private key format';
    }
    return true;
  });

  test('Generate RSA key pair with custom size', () => {
    const keyPair = generateKeyPair(1024);
    if (!keyPair.publicKeyPEM || !keyPair.privateKeyPEM) {
      return 'Key pair generation failed';
    }
    if (!keyPair.publicKeyPEM.includes('BEGIN PUBLIC KEY')) {
      return 'Invalid public key format';
    }
    if (!keyPair.privateKeyPEM.includes('BEGIN PRIVATE KEY')) {
      return 'Invalid private key format';
    }
    return true;
  });

  // Test 2: Key Validation
  console.log('\n🔍 Testing Key Validation...');
  const testKeyPair = generateKeyPair();
  
  test('Validate public key', () => {
    return validateKey(testKeyPair.publicKeyPEM, false);
  });

  test('Validate private key', () => {
    return validateKey(testKeyPair.privateKeyPEM, true);
  });

  test('Invalid key validation', () => {
    return !validateKey('invalid-key', false);
  });

  // Test 3: Basic Encryption/Decryption
  console.log('\n🔒 Testing Basic Encryption/Decryption...');
  
  // Initialize crypto with test keys
  process.env.RSA_PUBLIC_KEY = testKeyPair.publicKeyPEM.replace(/\n/g, '\\n');
  process.env.RSA_PRIVATE_KEY = testKeyPair.privateKeyPEM.replace(/\n/g, '\\n');
  
  // Clear require cache to reload with new env vars
  delete require.cache[require.resolve('../src/utils/rsaCrypto')];
  const { encrypt: newEncrypt, decrypt: newDecrypt } = require('../src/utils/rsaCrypto');

  for (const message of testMessages.filter(m => m !== '')) { // Skip empty string for now
    test(`Encrypt/Decrypt: "${message.substring(0, 20)}${message.length > 20 ? '...' : ''}"`, () => {
      const encrypted = newEncrypt(message);
      const decrypted = newDecrypt(encrypted);
      if (decrypted !== message) {
        return `Expected: ${message}, Got: ${decrypted}`;
      }
      return true;
    });
  }

  // Test 4: Empty String Handling
  console.log('\n📭 Testing Empty String Handling...');
  test('Encrypt empty string should throw', () => {
    try {
      newEncrypt('');
      return 'Should have thrown an error';
    } catch (error) {
      return error.message.includes('Invalid plaintext');
    }
  });

  // Test 5: Error Handling
  console.log('\n⚠️  Testing Error Handling...');
  test('Encrypt null should throw', () => {
    try {
      newEncrypt(null);
      return 'Should have thrown an error';
    } catch (error) {
      return error.message.includes('Invalid plaintext');
    }
  });

  test('Decrypt invalid data should throw', () => {
    try {
      newDecrypt('invalid-encrypted-data');
      return 'Should have thrown an error';
    } catch (error) {
      return error.message.includes('decryption failed');
    }
  });

  test('Decrypt null should throw', () => {
    try {
      newDecrypt(null);
      return 'Should have thrown an error';
    } catch (error) {
      return error.message.includes('Invalid encrypted data');
    }
  });

  // Test 6: Cross-Key Encryption
  console.log('\n🔄 Testing Cross-Key Encryption...');
  const anotherKeyPair = generateKeyPair();
  
  test('Encrypt with external public key', () => {
    const encrypted = encryptWithPublicKey(testApiKey, anotherKeyPair.publicKeyPEM);
    if (!encrypted || encrypted.length === 0) {
      return 'Encryption failed';
    }
    return true;
  });

  test('Cannot decrypt with wrong private key', () => {
    const encrypted = newEncrypt(testApiKey);
    try {
      // Try to decrypt with different key pair (should fail)
      process.env.RSA_PRIVATE_KEY = anotherKeyPair.privateKeyPEM.replace(/\n/g, '\\n');
      delete require.cache[require.resolve('../src/utils/rsaCrypto')];
      const { decrypt: wrongDecrypt } = require('../src/utils/rsaCrypto');
      
      wrongDecrypt(encrypted);
      return 'Should have failed to decrypt with wrong key';
    } catch (error) {
      // Reset to correct key
      process.env.RSA_PRIVATE_KEY = testKeyPair.privateKeyPEM.replace(/\n/g, '\\n');
      delete require.cache[require.resolve('../src/utils/rsaCrypto')];
      return true;
    }
  });

  // Test 7: Performance Test
  console.log('\n⚡ Testing Performance...');
  test('Encrypt/Decrypt performance (100 iterations)', () => {
    const startTime = Date.now();
    const iterations = 100;
    
    for (let i = 0; i < iterations; i++) {
      const encrypted = newEncrypt(`test-message-${i}`);
      const decrypted = newDecrypt(encrypted);
      if (decrypted !== `test-message-${i}`) {
        return `Performance test failed at iteration ${i}`;
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`   • ${iterations} encrypt/decrypt cycles completed in ${duration}ms`);
    console.log(`   • Average: ${(duration / iterations).toFixed(2)}ms per cycle`);
    
    return duration < 10000; // Should complete within 10 seconds
  });

  // Test 8: Large Data Test (within RSA limits)
  console.log('\n📊 Testing Large Data...');
  const largeApiKey = 'sk-' + 'x'.repeat(100); // Reasonably large API key within RSA limits
  
  test('Encrypt/Decrypt large API key (within RSA limits)', () => {
    try {
      const encrypted = newEncrypt(largeApiKey);
      const decrypted = newDecrypt(encrypted);
      return decrypted === largeApiKey;
    } catch (error) {
      return `Large data test failed: ${error.message}`;
    }
  });

  // Test RSA size limits
  test('RSA size limit validation', () => {
    const tooLargeApiKey = 'sk-' + 'x'.repeat(1000); // Exceeds RSA-2048 capacity
    try {
      newEncrypt(tooLargeApiKey);
      return 'Should have failed with data too large error';
    } catch (error) {
      return error.message.includes('data too large') || error.message.includes('RSA encryption failed');
    }
  });

  // Test 9: RSA Class Instance Test
  console.log('\n🏗️  Testing RSA Class Instance...');
  test('RSA class instantiation', () => {
    const rsa = new RSACrypto();
    return rsa && typeof rsa.encrypt === 'function';
  });

  test('RSA class with custom keys', () => {
    const rsa = new RSACrypto();
    // Mock environment to test custom key loading
    const originalPublic = process.env.RSA_PUBLIC_KEY;
    const originalPrivate = process.env.RSA_PRIVATE_KEY;
    
    process.env.RSA_PUBLIC_KEY = testKeyPair.publicKeyPEM.replace(/\n/g, '\\n');
    process.env.RSA_PRIVATE_KEY = testKeyPair.privateKeyPEM.replace(/\n/g, '\\n');
    
    const newRsa = new RSACrypto();
    const publicKey = newRsa.getPublicKey();
    
    // Restore original values
    process.env.RSA_PUBLIC_KEY = originalPublic;
    process.env.RSA_PRIVATE_KEY = originalPrivate;
    
    return publicKey && publicKey.includes('BEGIN PUBLIC KEY');
  });

  // Test 10: Integration Test with User Model Format
  console.log('\n🔗 Testing User Model Integration...');
  test('API key with rsa: prefix format', () => {
    const encrypted = newEncrypt(testApiKey);
    const withPrefix = 'rsa:' + encrypted;
    
    // Simulate what User model would do
    const extractedEncrypted = withPrefix.substring(4);
    const decrypted = newDecrypt(extractedEncrypted);
    
    return decrypted === testApiKey;
  });

  // Summary
  console.log('\n📋 Test Summary');
  console.log('===============');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! RSA encryption implementation is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);