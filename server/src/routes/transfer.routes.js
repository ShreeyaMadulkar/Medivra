'use strict';
// Workflow: PENDING -> IN_TRANSIT -> DELIVERED (+ PENDING -> CANCELLED). ADMIN is read-only here.
const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { parseId, actorOf } = require('../utils/http');
const svc = require('../services/transfer.service');
const s = require('../validation/core.schemas');

const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json(await svc.list(req.user, req.query)));
router.post('/', requireRole('DISTRIBUTOR'), validateBody(s.createTransferBody), async (req, res) =>
  res.status(201).json(await svc.create(actorOf(req), req.body)));
router.get('/:id', async (req, res) => res.json(await svc.getOne(req.user, parseId(req.params.id))));
router.post('/:id/dispatch', requireRole('DISTRIBUTOR'), async (req, res) => res.json(await svc.dispatch(actorOf(req), parseId(req.params.id))));
router.post('/:id/receive', requireRole('PHARMACY'), async (req, res) => res.json(await svc.receive(actorOf(req), parseId(req.params.id))));
router.post('/:id/cancel', requireRole('DISTRIBUTOR'), validateBody(s.cancelTransferBody), async (req, res) =>
  res.json(await svc.cancel(actorOf(req), parseId(req.params.id), req.body)));

module.exports = router;
