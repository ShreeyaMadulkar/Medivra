'use strict';
const jwt = require('jsonwebtoken');
const { jwt: cfg } = require('../config/env');

/** Minimal claims: subject (user id), role and organization id (informational only - see authenticate middleware). */
function signToken(user) {
  return jwt.sign(
    { role: user.role, org: user.organizationId == null ? null : String(user.organizationId) },
    cfg.secret,
    { algorithm: 'HS256', subject: String(user.id), expiresIn: cfg.expiresIn, issuer: cfg.issuer, audience: cfg.audience },
  );
}

/** Throws on bad signature, wrong algorithm, wrong issuer/audience or expiry. */
function verifyToken(token) {
  return jwt.verify(token, cfg.secret, { algorithms: ['HS256'], issuer: cfg.issuer, audience: cfg.audience });
}

module.exports = { signToken, verifyToken };
