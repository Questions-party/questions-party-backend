const jsrsasign = require('jsrsasign');
const { KEYUTIL } = jsrsasign;
const crypto = require('crypto');

class RSACrypto {
  constructor() {
    this.keySize = 2048;
    this.initializeKeys();
  }

  // Initialize RSA key pair from environment or generate new ones
  initializeKeys() {
    if (process.env.RSA_PUBLIC_KEY && process.env.RSA_PRIVATE_KEY) {
      this.publicKeyPEM = process.env.RSA_PUBLIC_KEY.replace(/\\n/g, '\n');
      this.privateKeyPEM = process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else {
      console.warn('RSA keys not found in environment. Generating new keys...');
      const keyPair = this.generateKeyPair();
      this.publicKeyPEM = keyPair.publicKeyPEM;
      this.privateKeyPEM = keyPair.privateKeyPEM;
      
      console.log('Generated RSA Public Key:', this.publicKeyPEM);
      console.log('Generated RSA Private Key:', this.privateKeyPEM);
      console.log('Please add these keys to your .env file:');
      console.log('RSA_PUBLIC_KEY="' + this.publicKeyPEM.replace(/\n/g, '\\n') + '"');
      console.log('RSA_PRIVATE_KEY="' + this.privateKeyPEM.replace(/\n/g, '\\n') + '"');
    }
  }

  // Generate RSA key pair
  generateKeyPair(keySize = 2048) {
    try {
      const keyPair = KEYUTIL.generateKeypair('RSA', keySize);
      const publicKeyPEM = KEYUTIL.getPEM(keyPair.pubKeyObj);
      const privateKeyPEM = KEYUTIL.getPEM(keyPair.prvKeyObj, 'PKCS8PRV');
      
      return { publicKeyPEM, privateKeyPEM };
    } catch (error) {
      throw new Error(`RSA key generation failed: ${error.message}`);
    }
  }

  // Get public key for frontend
  getPublicKey() {
    return this.publicKeyPEM;
  }

  // Encrypt data using RSA-OAEP with public key
  encrypt(plaintext) {
    try {
      if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Invalid plaintext for encryption');
      }

      // Load public key
      const pubKeyObj = KEYUTIL.getKey(this.publicKeyPEM);
      
      // Convert plaintext to buffer
      const buffer = Buffer.from(plaintext, 'utf8');
      
      // RSA-OAEP encryption using Node.js crypto (more reliable than jsrsasign for OAEP)
      const encrypted = crypto.publicEncrypt(
        {
          key: this.publicKeyPEM,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );

      return encrypted.toString('base64');
    } catch (error) {
      throw new Error(`RSA encryption failed: ${error.message}`);
    }
  }

  // Decrypt data using RSA-OAEP with private key
  decrypt(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data for decryption');
      }

      // Convert base64 to buffer
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');
      
      // RSA-OAEP decryption using Node.js crypto
      const decrypted = crypto.privateDecrypt(
        {
          key: this.privateKeyPEM,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        encryptedBuffer
      );

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`RSA decryption failed: ${error.message}`);
    }
  }

  // Encrypt using frontend public key (for testing)
  encryptWithPublicKey(plaintext, publicKeyPEM) {
    try {
      if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Invalid plaintext for encryption');
      }

      const buffer = Buffer.from(plaintext, 'utf8');
      
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKeyPEM,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );

      return encrypted.toString('base64');
    } catch (error) {
      throw new Error(`RSA encryption with provided key failed: ${error.message}`);
    }
  }

  // Validate if a key is valid RSA key
  validateKey(keyPEM, isPrivate = false) {
    try {
      const keyObj = KEYUTIL.getKey(keyPEM);
      return keyObj && (isPrivate ? keyObj.isPrivate : keyObj.isPublic);
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
const rsaCrypto = new RSACrypto();

module.exports = {
  RSACrypto,
  rsaCrypto,
  generateKeyPair: (keySize) => rsaCrypto.generateKeyPair(keySize),
  encrypt: (plaintext) => rsaCrypto.encrypt(plaintext),
  decrypt: (encryptedData) => rsaCrypto.decrypt(encryptedData),
  getPublicKey: () => rsaCrypto.getPublicKey(),
  encryptWithPublicKey: (plaintext, publicKey) => rsaCrypto.encryptWithPublicKey(plaintext, publicKey),
  validateKey: (keyPEM, isPrivate) => rsaCrypto.validateKey(keyPEM, isPrivate)
}; 