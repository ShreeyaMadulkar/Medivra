'use strict';
/**
 * AES-256-GCM field encryption.
 *   AES_SECRET = 64 hex characters (32 bytes). Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   Stored format: v1:<iv hex>:<auth tag hex>:<ciphertext hex>   (fresh random 12-byte IV for every encryption)
 *   `context` (e.g. "transfers.notes") is bound as additional authenticated data, so a ciphertext copied into
 *   another column/table fails to decrypt.
 */
const crypto = require('crypto');
const config = require('../config/env');

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const secret = config.aesSecret;
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('AES_SECRET must be exactly 64 hex characters (32 bytes). See .env.example.');
  }
  const key = Buffer.from(secret, 'hex');
  if (key.every((b) => b === key[0])) throw new Error('AES_SECRET is not random enough.');
  cachedKey = key;
  return key;
}

/** Fail fast at startup. */
const assertCryptoReady = () => { getKey(); };

function encrypt(plaintext, context) {
  if (plaintext === null || plaintext === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(String(context), 'utf8'));
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(stored, context) {
  if (stored === null || stored === undefined) return null;
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported ciphertext format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(parts[1], 'hex'), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(String(context), 'utf8'));
  decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, assertCryptoReady };
