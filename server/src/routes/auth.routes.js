'use strict';
const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const { validateBody } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiters');
const { registerBody, loginBody } = require('../validation/auth.schemas');

const router = Router();
router.post('/register', registerLimiter, validateBody(registerBody), ctrl.register);
router.post('/login', loginLimiter, validateBody(loginBody), ctrl.login);
router.get('/me', authenticate, ctrl.me);
module.exports = router;
