'use strict';
/**
 * Password hashing - SHA-512 with a per-user random salt (academic project requirement).
 *
 *   salt = 32 cryptographically random bytes, stored as 64 lowercase hex chars
 *   hash = SHA-512( salt_bytes || UTF-8(NFC(password)) ), stored as 128 lowercase hex chars
 *
 * NOTE: a single salted SHA-512 round is fast, which makes offline guessing cheap. For production
 * use Argon2id or scrypt (crypto.scrypt is built into Node) - or at least PBKDF2 with many iterations.
 */
const crypto = require('crypto');

const SALT_BYTES = 32;
const normalize = (password) => Buffer.from(String(password).normalize('NFC'), 'utf8');

function generateSalt() {
  return crypto.randomBytes(SALT_BYTES).toString('hex');
}

function hashPassword(password, saltHex) {
  return crypto.createHash('sha512').update(Buffer.from(saltHex, 'hex')).update(normalize(password)).digest('hex');
}

/** Creates a fresh salt + hash for a new password. */
function createPasswordRecord(password) {
  const salt = generateSalt();
  return { salt, hash: hashPassword(password, salt) };
}

/** Constant-time comparison of the recomputed hash with the stored one. */
function verifyPassword(password, saltHex, storedHashHex) {
  const actual = Buffer.from(hashPassword(password, saltHex), 'hex');
  const expected = Buffer.from(String(storedHashHex), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

// Used to keep response time similar when the email does not exist.
const DUMMY_SALT = generateSalt();
const DUMMY_HASH = hashPassword('dummy-password-for-timing', DUMMY_SALT);
const burnDummyVerification = (password) => verifyPassword(password, DUMMY_SALT, DUMMY_HASH);

module.exports = { generateSalt, hashPassword, createPasswordRecord, verifyPassword, burnDummyVerification };
