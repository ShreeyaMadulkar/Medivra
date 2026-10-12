'use strict';
// ADMIN-only: organizations, user accounts, platform overview. Mounted at /api (see app.js).
const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { parseId, actorOf } = require('../utils/http');
const svc = require('../services/admin.service');
const s = require('../validation/core.schemas');

const router = Router();
// NOTE: authenticate is attached per route (not router.use) because this router is mounted at /api,
// and unknown /api/* paths must still fall through to the 404 handler (Phase 1 test 12).
const admin = [authenticate, requireRole('ADMIN')];

// Distributors need the pharmacy directory to address a transfer (id + name of ACTIVE pharmacies only).
router.get('/organizations/pharmacies', authenticate, requireRole('DISTRIBUTOR', 'ADMIN'), async (req, res) => res.json(await svc.listPharmacyDirectory(req.query)));

router.get('/organizations', ...admin, async (req, res) => res.json(await svc.listOrganizations(req.query)));
router.post('/organizations', ...admin, validateBody(s.createOrganizationBody), async (req, res) =>
  res.status(201).json(await svc.createOrganization(actorOf(req), req.body)));
router.get('/organizations/:id', ...admin, async (req, res) => res.json(await svc.getOrganization(parseId(req.params.id))));
router.patch('/organizations/:id', ...admin, validateBody(s.updateOrganizationBody), async (req, res) =>
  res.json(await svc.updateOrganization(actorOf(req), parseId(req.params.id), req.body)));

router.get('/users', ...admin, async (req, res) => res.json(await svc.listUsers(req.query)));
router.post('/users', ...admin, validateBody(s.createUserBody), async (req, res) =>
  res.status(201).json(await svc.createUser(actorOf(req), req.body)));
router.get('/users/:id', ...admin, async (req, res) => res.json(await svc.getUser(parseId(req.params.id))));
router.patch('/users/:id', ...admin, validateBody(s.updateUserBody), async (req, res) =>
  res.json(await svc.updateUser(actorOf(req), parseId(req.params.id), req.body)));

router.get('/admin/overview', ...admin, async (_req, res) => res.json({ overview: await svc.overview() }));

module.exports = router;
