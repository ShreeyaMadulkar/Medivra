'use strict';
/** Phase 2: role permissions, organization isolation, admin management, audit visibility. */
const kit = require('./helpers/testkit'); // must be first (sets env)
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, makeActor, makeBatch, auditCount, DOMAIN, uniq } = kit;

kit.useServer();
let admin; let distA; let distB; let phA; let phB; let batchA; let transferA;

before(async () => {
  admin = await makeActor('ADMIN');
  distA = await makeActor('DISTRIBUTOR', 'distA');
  distB = await makeActor('DISTRIBUTOR', 'distB');
  phA = await makeActor('PHARMACY', 'phA');
  phB = await makeActor('PHARMACY', 'phB');
  batchA = await makeBatch(distA);
  const t = await api('POST', '/api/transfers', { toOrganizationId: phA.orgId, items: [{ batchId: batchA.id, quantity: 10 }] }, distA.token);
  assert.equal(t.status, 201);
  transferA = t.json.transfer;
});

test('Phase 1 login still works and /me reflects the DB role', async () => {
  const r = await api('GET', '/api/auth/me', undefined, distA.token);
  assert.equal(r.status, 200);
  assert.equal(r.json.user.role, 'DISTRIBUTOR');
});

test('every protected endpoint rejects missing tokens (401)', async () => {
  for (const [m, u] of [['GET', '/api/batches'], ['POST', '/api/batches'], ['GET', '/api/inventory'], ['GET', '/api/inventory/summary'],
    ['GET', '/api/transfers'], ['POST', '/api/transfers'], ['POST', '/api/transfers/1/dispatch'], ['POST', '/api/transfers/1/receive'],
    ['GET', '/api/audit-logs'], ['GET', '/api/organizations'], ['GET', '/api/users'], ['GET', '/api/admin/overview']]) {
    assert.equal((await api(m, u, m === 'POST' ? {} : undefined)).status, 401, `${m} ${u}`);
  }
});

test('ADMIN cannot create batches, adjust stock, create/dispatch/receive/cancel transfers', async () => {
  assert.equal((await api('POST', '/api/batches', kit.batchBody(), admin.token)).status, 403);
  assert.equal((await api('POST', `/api/inventory/${batchA.id}/adjust`, { delta: 1, reason: 'test' }, admin.token)).status, 403);
  assert.equal((await api('POST', '/api/transfers', { toOrganizationId: phA.orgId, items: [{ batchId: batchA.id, quantity: 1 }] }, admin.token)).status, 403);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/dispatch`, undefined, admin.token)).status, 403);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/receive`, undefined, admin.token)).status, 403);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/cancel`, {}, admin.token)).status, 403);
  assert.equal((await api('PATCH', `/api/batches/${batchA.id}`, { notes: 'x' }, admin.token)).status, 403);
});

test('ADMIN can read platform-wide data', async () => {
  assert.equal((await api('GET', '/api/batches', undefined, admin.token)).status, 200);
  assert.equal((await api('GET', `/api/batches/${batchA.id}`, undefined, admin.token)).status, 200);
  const inv = await api('GET', '/api/inventory?limit=100', undefined, admin.token);
  assert.equal(inv.status, 200);
  assert.ok(inv.json.inventory.some((i) => i.organizationId === distA.orgId));
  const tr = await api('GET', '/api/transfers', undefined, admin.token);
  assert.ok(tr.json.transfers.some((t) => t.id === transferA.id));
  assert.equal((await api('GET', '/api/inventory/summary', undefined, admin.token)).json.summary.scope, 'PLATFORM');
  const ov = await api('GET', '/api/admin/overview', undefined, admin.token);
  assert.equal(ov.status, 200);
  assert.ok(ov.json.overview.organizations.total >= 4);
});

test('DISTRIBUTOR and PHARMACY cannot use admin endpoints', async () => {
  for (const who of [distA, phA]) {
    for (const [m, u, b] of [['GET', '/api/organizations'], ['POST', '/api/organizations', { name: 'X Org', type: 'PHARMACY' }], ['GET', '/api/users'],
      ['POST', '/api/users', {}], ['PATCH', `/api/users/${distB.userId}`, { status: 'INACTIVE' }], ['PATCH', `/api/organizations/${distB.orgId}`, { status: 'INACTIVE' }], ['GET', '/api/admin/overview']]) {
      assert.equal((await api(m, u, b, who.token)).status, 403, `${who.role} ${m} ${u}`);
    }
  }
});

test('PHARMACY cannot create batches, adjust stock, create/dispatch/cancel transfers', async () => {
  assert.equal((await api('POST', '/api/batches', kit.batchBody(), phA.token)).status, 403);
  assert.equal((await api('POST', `/api/inventory/${batchA.id}/adjust`, { delta: 1, reason: 'test' }, phA.token)).status, 403);
  assert.equal((await api('POST', '/api/transfers', { toOrganizationId: phB.orgId, items: [{ batchId: batchA.id, quantity: 1 }] }, phA.token)).status, 403);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/dispatch`, undefined, phA.token)).status, 403);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/cancel`, {}, phA.token)).status, 403);
});

test('DISTRIBUTOR cannot confirm receipt', async () => {
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/receive`, undefined, distA.token)).status, 403);
});

test('cross-organization access is rejected (404, no data leak)', async () => {
  // another distributor
  assert.equal((await api('GET', `/api/batches/${batchA.id}`, undefined, distB.token)).status, 404);
  assert.equal((await api('PATCH', `/api/batches/${batchA.id}`, { notes: 'hijack' }, distB.token)).status, 404);
  assert.equal((await api('POST', `/api/inventory/${batchA.id}/adjust`, { delta: 5, reason: 'hijack' }, distB.token)).status, 404);
  assert.equal((await api('GET', `/api/inventory/${batchA.id}`, undefined, distB.token)).status, 404);
  assert.equal((await api('GET', `/api/transfers/${transferA.id}`, undefined, distB.token)).status, 404);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/dispatch`, undefined, distB.token)).status, 404);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/cancel`, {}, distB.token)).status, 404);
  const list = await api('GET', '/api/transfers', undefined, distB.token);
  assert.equal(list.json.transfers.length, 0);
  assert.equal((await api('GET', '/api/batches', undefined, distB.token)).json.batches.length, 0);
  // a distributor cannot move another distributor's batch
  const steal = await api('POST', '/api/transfers', { toOrganizationId: phB.orgId, items: [{ batchId: batchA.id, quantity: 1 }] }, distB.token);
  assert.equal(steal.status, 404);
  // other pharmacy
  assert.equal((await api('GET', `/api/transfers/${transferA.id}`, undefined, phB.token)).status, 404);
  assert.equal((await api('POST', `/api/transfers/${transferA.id}/receive`, undefined, phB.token)).status, 404);
});

test('client-supplied organization ids are never trusted', async () => {
  const body = kit.batchBody({ organizationId: distB.orgId });
  assert.equal((await api('POST', '/api/batches', body, distA.token)).status, 400); // strict schema
  const inv = await api('GET', `/api/inventory?organizationId=${distB.orgId}`, undefined, distA.token);
  assert.equal(inv.status, 200);
  assert.ok(inv.json.inventory.every((i) => i.organizationId === distA.orgId)); // ignored: pinned to own org
  const a = await api('GET', `/api/audit-logs?organizationId=${distB.orgId}`, undefined, distA.token);
  assert.ok(a.json.auditLogs.every((l) => l.organizationId === distA.orgId));
});

test('invalid ids are rejected before reaching SQL', async () => {
  assert.equal((await api('GET', '/api/batches/abc', undefined, distA.token)).status, 400);
  assert.equal((await api('GET', '/api/batches/1%20OR%201=1', undefined, distA.token)).status, 400);
  assert.equal((await api('GET', '/api/transfers/0', undefined, distA.token)).status, 400);
  assert.equal((await api('GET', '/api/batches?limit=1000', undefined, distA.token)).status, 400);
  assert.equal((await api('GET', '/api/batches?page=0', undefined, distA.token)).status, 400);
});

test('pharmacy directory exposes only active pharmacies (id + name) to distributors', async () => {
  const r = await api('GET', '/api/organizations/pharmacies?limit=100', undefined, distA.token);
  assert.equal(r.status, 200);
  assert.ok(r.json.organizations.some((o) => o.id === phA.orgId));
  assert.ok(r.json.organizations.every((o) => o.type === 'PHARMACY' && Object.keys(o).sort().join() === 'id,name,type'));
  assert.equal((await api('GET', '/api/organizations/pharmacies', undefined, phA.token)).status, 403);
});

test('admin manages organizations: create, duplicate, deactivate cuts off its users, reactivate', async () => {
  const name = `TestOrg admin-made ${uniq()}`;
  const c = await api('POST', '/api/organizations', { name, type: 'PHARMACY' }, admin.token);
  assert.equal(c.status, 201);
  assert.equal((await api('POST', '/api/organizations', { name, type: 'PHARMACY' }, admin.token)).status, 409);
  assert.equal((await api('POST', '/api/organizations', { name: 'A', type: 'ADMIN' }, admin.token)).status, 400);
  const id = c.json.organization.id;
  assert.equal((await api('GET', `/api/organizations/${id}`, undefined, admin.token)).json.organization.name, name);

  // deactivate phB's organization -> its token stops working immediately (Phase 1 loadActiveUser)
  assert.equal((await api('PATCH', `/api/organizations/${phB.orgId}`, { status: 'INACTIVE' }, admin.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', undefined, phB.token)).status, 401);
  const dir = await api('GET', '/api/organizations/pharmacies?limit=100', undefined, distA.token);
  assert.ok(!dir.json.organizations.some((o) => o.id === phB.orgId));
  assert.equal((await api('PATCH', `/api/organizations/${phB.orgId}`, { status: 'ACTIVE' }, admin.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', undefined, phB.token)).status, 200);
  assert.ok((await auditCount("action IN ('ORGANIZATION_CREATED','ORGANIZATION_STATUS_CHANGED') AND actor_user_id = ?", [admin.userId])) >= 3);
});

test('admin manages users: create, validate, deactivate/reactivate, no self-lockout, no role/org escalation', async () => {
  const email = `made${uniq()}${DOMAIN}`;
  const body = { name: 'Made By Admin', email, phone: '+91 98765 43210', role: 'PHARMACY', organizationId: phA.orgId, password: 'Medivra@123' };
  const c = await api('POST', '/api/users', body, admin.token);
  assert.equal(c.status, 201);
  assert.ok(!JSON.stringify(c.json).includes('password'));
  const uid = c.json.user.id;
  assert.equal((await api('POST', '/api/users', body, admin.token)).status, 409); // duplicate email
  assert.equal((await api('POST', '/api/users', { ...body, email: `x${uniq()}${DOMAIN}`, role: 'DISTRIBUTOR' }, admin.token)).status, 400); // role != org type
  assert.equal((await api('POST', '/api/users', { ...body, email: `y${uniq()}${DOMAIN}`, role: 'ADMIN' }, admin.token)).status, 400); // admin with org
  assert.equal((await api('POST', '/api/users', { ...body, email: `z${uniq()}${DOMAIN}`, password: 'weak' }, admin.token)).status, 400);
  const login = await api('POST', '/api/auth/login', { email, password: 'Medivra@123' });
  assert.equal(login.status, 200);
  assert.equal((await api('PATCH', `/api/users/${uid}`, { status: 'INACTIVE' }, admin.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', undefined, login.json.token)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email, password: 'Medivra@123' })).status, 403);
  assert.equal((await api('PATCH', `/api/users/${uid}`, { status: 'ACTIVE' }, admin.token)).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email, password: 'Medivra@123' })).status, 200);
  assert.equal((await api('PATCH', `/api/users/${admin.userId}`, { status: 'INACTIVE' }, admin.token)).status, 409);
  assert.equal((await api('PATCH', `/api/users/${uid}`, { role: 'ADMIN' }, admin.token)).status, 400);
  assert.equal((await api('PATCH', `/api/users/${uid}`, { organizationId: distA.orgId }, admin.token)).status, 400);
  assert.equal((await api('PATCH', `/api/users/${uid}`, {}, admin.token)).status, 400);
  assert.equal((await api('GET', '/api/users/99999999', undefined, admin.token)).status, 404);
  const l = await api('GET', `/api/users?organizationId=${phA.orgId}&limit=1`, undefined, admin.token);
  assert.equal(l.status, 200);
  assert.equal(l.json.pagination.limit, 1);
  assert.ok(l.json.pagination.total >= 2 && l.json.pagination.totalPages >= 2);
  assert.ok(!JSON.stringify(l.json).includes('password_hash'));
  assert.ok((await auditCount("action IN ('USER_CREATED','USER_STATUS_CHANGED') AND actor_user_id = ?", [admin.userId])) >= 3);
});

test('audit logs: admin sees all, organizations see only their own, nobody can write', async () => {
  const a = await api('GET', '/api/audit-logs?limit=100', undefined, admin.token);
  assert.equal(a.status, 200);
  assert.ok(a.json.auditLogs.length > 0 && a.json.pagination.total >= a.json.auditLogs.length);
  const d = await api('GET', '/api/audit-logs?limit=100', undefined, distA.token);
  assert.ok(d.json.auditLogs.length > 0);
  assert.ok(d.json.auditLogs.every((l) => l.organizationId === distA.orgId));
  assert.ok(d.json.auditLogs.every((l) => l.ip === undefined)); // IPs only for admins
  assert.ok(d.json.auditLogs.some((l) => l.action === 'BATCH_CREATED'));
  const p = await api('GET', '/api/audit-logs', undefined, phB.token);
  assert.ok(p.json.auditLogs.every((l) => l.organizationId === phB.orgId));
  assert.equal((await api('POST', '/api/audit-logs', {}, admin.token)).status, 404);
  assert.equal((await api('DELETE', '/api/audit-logs/1', undefined, admin.token)).status, 404);
  const f = await api('GET', '/api/audit-logs?action=BATCH_CREATED&entityType=BATCH', undefined, admin.token);
  assert.ok(f.json.auditLogs.every((l) => l.action === 'BATCH_CREATED'));
  assert.equal((await api('GET', '/api/audit-logs?from=not-a-date', undefined, admin.token)).status, 400);
});

test('error responses never expose SQL, stack traces or secrets', async () => {
  const r = await api('GET', '/api/transfers?status=DROP%20TABLE', undefined, distA.token);
  assert.equal(r.status, 400);
  for (const bad of ['sql', 'ER_', 'stack', 'password_hash', 'JWT_SECRET', 'AES_SECRET', 'at Object']) assert.ok(!r.text.includes(bad));
  const x = await api('POST', '/api/batches', '{bad json', distA.token);
  assert.ok([400, 401].includes(x.status));
  await pool.execute('SELECT 1');
});
