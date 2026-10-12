'use strict';
require('dotenv').config();

const int = (name, def) => {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid numeric environment variable ${name}`);
  return n;
};

const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters (see .env.example).');
}

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 5000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int('DB_PORT', 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medivra',
  },
  jwt: { secret: jwtSecret, expiresIn: process.env.JWT_EXPIRES_IN || '1h', issuer: 'medivra', audience: 'medivra-app' },
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  lockout: { maxFailed: int('MAX_FAILED_LOGINS', 3), seconds: int('LOCKOUT_SECONDS', 30) },
  rateLimit: {
    loginMax: int('LOGIN_RATE_LIMIT_MAX', 20),
    loginWindowMs: int('LOGIN_RATE_LIMIT_WINDOW_SECONDS', 60) * 1000,
    registerMax: int('REGISTER_RATE_LIMIT_MAX', 20),
    registerWindowMs: int('REGISTER_RATE_LIMIT_WINDOW_SECONDS', 3600) * 1000,
  },
  // Raw AES_SECRET; validated lazily by utils/fieldCrypto.js (and at server start) so Phase 1 code/tests need no change.
  aesSecret: process.env.AES_SECRET || '',
  lowStockThreshold: int('LOW_STOCK_THRESHOLD', 50),
  registrationRequiresApproval: String(process.env.REGISTRATION_REQUIRES_APPROVAL || 'false').toLowerCase() === 'true',
});
