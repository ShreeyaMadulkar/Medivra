'use strict';
const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { parseId, actorOf } = require('../utils/http');
const svc = require('../services/inventory.service');
const s = require('../validation/core.schemas');

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json(await svc.list(req.user, req.query)));
router.get('/summary', async (req, res) => res.json(await svc.summary(req.user, req.query)));
router.get('/:batchId', async (req, res) => res.json(await svc.lookup(req.user, parseId(req.params.batchId, 'batchId'))));
router.post('/:batchId/adjust', requireRole('DISTRIBUTOR'), validateBody(s.adjustStockBody), async (req, res) =>
  res.json(await svc.adjust(actorOf(req), parseId(req.params.batchId, 'batchId'), req.body)));

module.exports = router;
