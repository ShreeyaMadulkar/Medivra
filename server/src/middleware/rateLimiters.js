'use strict';
const { rateLimit } = require('express-rate-limit');
const cfg = require('../config/env').rateLimit;

const make = (limit, windowMs) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }),
  });

module.exports = {
  loginLimiter: make(cfg.loginMax, cfg.loginWindowMs),
  registerLimiter: make(cfg.registerMax, cfg.registerWindowMs),
};
