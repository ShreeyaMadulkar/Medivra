'use strict';
// Batches. Only DISTRIBUTORs write; every role reads only what its organization may see (ADMIN: all, read-only).
const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { parseId, actorOf } = require('../utils/http');
const svc = require('../services/batch.service');
const s = require('../validation/core.schemas');

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json(await svc.list(req.user, req.query)));
router.post('/', requireRole('DISTRIBUTOR'), validateBody(s.createBatchBody), async (req, res) =>
  res.status(201).json(await svc.create(actorOf(req), req.body)));
router.get('/:id', async (req, res) => res.json(await svc.getOne(req.user, parseId(req.params.id))));
router.patch('/:id', requireRole('DISTRIBUTOR'), validateBody(s.updateBatchBody), async (req, res) =>
  res.json(await svc.update(actorOf(req), parseId(req.params.id), req.body)));

module.exports = router;
