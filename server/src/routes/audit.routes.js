'use strict';
// ADMIN: platform-wide. DISTRIBUTOR/PHARMACY: their own organization's entries only. Read-only; there is no write API.
const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const svc = require('../services/audit.service');

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json(await svc.list(req.user, req.query)));

module.exports = router;
