// Frontend smoke tests (no browser, no backend needed): `npm run test:smoke`
// Compiles src/services/api.ts + mappers.ts in memory and checks the request shapes, token handling,
// 401 handling, pagination and backend->frontend mappings against a mocked fetch. It does NOT prove live integration.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'medivra-smoke-'));
for (const f of ['api', 'mappers']) {
  let js = ts.transpileModule(readFileSync(join(root, 'src/services', `${f}.ts`), 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2020' } }).outputText;
  js = js.replace(/import\.meta\.env/g, '({})').replace(/from '\.\/api'/g, "from './api.mjs'");
  writeFileSync(join(out, `${f}.mjs`), js);
}
writeFileSync(join(out, 'rbac.mjs'), ts.transpileModule(readFileSync(join(root, 'src/lib/rbac.ts'), 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2020' } }).outputText);
writeFileSync(join(out, 'utils.mjs'), ts.transpileModule(readFileSync(join(root, 'src/lib/utils.ts'), 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2020' } }).outputText);

// ---- stubs ----
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let calls = [];
let responder = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
  const r = responder(url, init);
  if (r instanceof Error) throw r;
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};

const { api, ApiError, tokenStore, tokenExpiresAt, setUnauthorizedHandler } = await import(pathToFileURL(join(out, 'api.mjs')));
const { canDispatch, canCancel, canConfirmDelivery, canEditBatch } = await import(pathToFileURL(join(out, 'rbac.mjs')));
const { batchStatus, aggregateByMedicine } = await import(pathToFileURL(join(out, 'utils.mjs')));
const { mapBatch, mapTransfer, mapAudit, transferApiId, transferRef } = await import(pathToFileURL(join(out, 'mappers.mjs')));

let passed = 0;
const t = async (name, fn) => { calls = []; store.clear(); setUnauthorizedHandler(null); await fn(); passed++; console.log(`ok - ${name}`); };
const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

await t('register posts exactly the fields the backend schema accepts', async () => {
  const body = { name: 'Asha Rao', email: 'asha@acme.test', phone: '+91 98765 43210', organization: 'Acme Distributors', role: 'DISTRIBUTOR', password: 'Medivra@123' };
  responder = () => ({ status: 201, body: { user: { id: '9' }, message: 'Registration successful. You can now sign in.' } });
  const r = await api.register(body);
  assert.equal(r.message, 'Registration successful. You can now sign in.');
  assert.match(calls[0].url, /\/auth\/register$/);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['email', 'name', 'organization', 'password', 'phone', 'role']);
  assert.equal(calls[0].headers.Authorization, undefined);
  const schema = join(root, 'server/src/validation/auth.schemas.js');
  if (existsSync(schema)) { const src = readFileSync(schema, 'utf8'); for (const k of Object.keys(body)) assert.ok(src.includes(k), `backend schema mentions ${k}`); assert.ok(src.includes("z.enum(['DISTRIBUTOR', 'PHARMACY']"), 'backend refuses ADMIN self-registration'); }
});

await t('backend validation / duplicate errors surface as ApiError with field details', async () => {
  responder = () => ({ status: 409, body: { error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } } });
  await assert.rejects(api.register({ name: 'A B', email: 'a@b.co', phone: '+91 98765 43210', organization: 'X Org', role: 'PHARMACY', password: 'Medivra@123' }), (e) => e instanceof ApiError && e.status === 409 && e.code === 'EMAIL_EXISTS');
  responder = () => ({ status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', details: { phone: 'Enter a valid phone number.' } } } });
  await assert.rejects(api.register({}), (e) => e.details.phone === 'Enter a valid phone number.');
});

await t('login sends role, returns token; lockout carries Retry-After seconds; network failure is explicit', async () => {
  responder = () => ({ status: 200, body: { token: 'tok', user: { id: '1', role: 'ADMIN' } } });
  const r = await api.login({ email: 'a@b.co', password: 'pw', role: 'ADMIN' });
  assert.equal(r.token, 'tok');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['email', 'password', 'role']);
  responder = () => ({ status: 429, body: { error: { code: 'ACCOUNT_LOCKED', message: 'locked', retryAfterSeconds: 30 } } });
  await assert.rejects(api.login({ email: 'a@b.co', password: 'x', role: 'ADMIN' }), (e) => e.code === 'ACCOUNT_LOCKED' && e.retryAfterSeconds === 30);
  responder = () => new Error('offline');
  await assert.rejects(api.login({ email: 'a@b.co', password: 'x', role: 'ADMIN' }), (e) => e.code === 'NETWORK' && e.status === 0);
});

await t('token store only holds the JWT; Bearer header is sent; passwords are never stored', async () => {
  tokenStore.set('abc.def.ghi');
  responder = () => ({ status: 200, body: { user: { id: '1' } } });
  await api.me();
  assert.equal(calls[0].headers.Authorization, 'Bearer abc.def.ghi');
  await api.login({ email: 'a@b.co', password: 'SuperSecret@1', role: 'ADMIN' }).catch(() => {});
  assert.ok(![...store.values()].some((v) => v.includes('SuperSecret')));
  tokenStore.clear();
  assert.equal(tokenStore.get(), null);
});

await t('401 on an authenticated request triggers the sign-out handler (not for login/register)', async () => {
  let fired = 0;
  setUnauthorizedHandler(() => { fired++; });
  responder = () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } } });
  tokenStore.set('expired.token.x');
  await assert.rejects(api.me());
  assert.equal(fired, 1);
  await assert.rejects(api.login({ email: 'a@b.co', password: 'x', role: 'ADMIN' }));
  assert.equal(fired, 1);
  tokenStore.clear();
  await assert.rejects(api.me()); // no token was sent -> nothing to expire
  assert.equal(fired, 1);
});

await t('tokenExpiresAt reads exp; garbage returns null', async () => {
  tokenStore.set(jwt({ exp: 2000000000 }));
  assert.equal(tokenExpiresAt(), 2000000000 * 1000);
  tokenStore.set('not-a-jwt');
  assert.equal(tokenExpiresAt(), null);
  tokenStore.clear();
  assert.equal(tokenExpiresAt(), null);
});

await t('list helpers walk every page (no silent partial lists)', async () => {
  responder = (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return { status: 200, body: { batches: [{ id: String(page) }], pagination: { page, limit: 100, total: 3, totalPages: 3 } } };
  };
  tokenStore.set('t');
  const all = await api.listBatches();
  assert.deepEqual(all.map((b) => b.id), ['1', '2', '3']);
});

await t('mappers: batch, transfer (TRF-000001), audit', async () => {
  const user = { id: '2', role: 'DISTRIBUTOR', organization: 'Acme', organizationId: '5' };
  const b = mapBatch({ id: '1', batchNumber: 'DEMO-001', medicineName: 'Paracetamol', category: 'Analgesic', manufacturer: 'M', manufactureDate: '2025-01-01', expiryDate: '2030-01-01', originalQuantity: 100, unitPrice: 2.5, quantity: 70, status: 'In Stock', updatedAt: '2026-10-12T00:00:00.000Z', originOrganization: 'Acme', originOrganizationId: '5' }, user);
  assert.deepEqual([b.batchNo, b.quantity, b.owner, b.ownerId, b.status], ['DEMO-001', 70, 'Acme', '5', 'In Stock']);
  const tr = mapTransfer({ id: '1', reference: 'TRF-000001', status: 'IN_TRANSIT', statusLabel: 'In Transit', fromOrganizationId: '5', fromOrganization: 'Acme', toOrganizationId: '6', toOrganization: 'Ph', items: [{ batchId: '1', batchNumber: 'DEMO-001', medicineName: 'Paracetamol', manufacturer: 'M', expiryDate: '2030-01-01', quantity: 30, receivedQuantity: null }], totalQuantity: 30, expectedDelivery: null, notes: '', cancelReason: null, createdAt: '2026-10-12T01:00:00.000Z', dispatchedAt: '2026-10-12T02:00:00.000Z', deliveredAt: null, cancelledAt: null, timeline: [{ at: '2026-10-12T01:00:00.000Z', event: 'CREATED', by: 'Asha' }] });
  assert.deepEqual([tr.id, tr.status, tr.quantity, tr.receivedQuantity, transferApiId(tr.id), transferRef(1)], ['TRF-000001', 'In Transit', 30, undefined, '1', 'TRF-000001']);
  const a = mapAudit({ id: '7', at: '2026-10-12T01:00:00.000Z', action: 'TRANSFER_DISPATCHED', entityType: 'TRANSFER', entityId: '1', actorId: '2', actor: 'Asha', actorRole: 'DISTRIBUTOR', organizationId: '5', organization: 'Acme', details: null });
  assert.equal(a.action, 'Transfer TRF-000001 dispatched');
});

await t('server-computed status wins; admin/org audit labels; inventory aggregation', async () => {
  assert.equal(batchStatus({ quantity: 5000, expiryDate: '2099-01-01', status: 'Expired' }), 'Expired'); // server value is never recomputed locally
  assert.equal(batchStatus({ quantity: 10, expiryDate: '2099-01-01' }), 'Low Stock');
  assert.equal(batchStatus({ quantity: 100, expiryDate: '2099-01-01' }), 'In Stock');
  const base = { id: '1', at: '2026-10-12T01:00:00.000Z', entityType: 'USER', entityId: '3', actorId: '1', actor: 'Admin', actorRole: 'ADMIN', organizationId: null, organization: null, details: null };
  assert.equal(mapAudit({ ...base, action: 'USER_STATUS_CHANGED' }).action, 'User account status changed');
  assert.equal(mapAudit({ ...base, action: 'ORGANIZATION_UPDATED', entityType: 'ORGANIZATION' }).action, 'Organization updated');
  const mk = (id, q, status) => ({ id, medicine: 'Paracetamol', category: 'Analgesic', quantity: q, expiryDate: '2099-01-01', status });
  const agg = aggregateByMedicine([mk('1', 40, 'Low Stock'), mk('2', 500, 'In Stock')]);
  assert.deepEqual([agg.length, agg[0].totalQuantity, agg[0].batchCount, agg[0].status], [1, 540, 2, 'Low Stock']);
});

await t('action buttons are scoped by organization id and status (server still re-checks)', async () => {
  const dist = { role: 'DISTRIBUTOR', organizationId: '5', organization: 'Acme' };
  const other = { role: 'DISTRIBUTOR', organizationId: '9', organization: 'Acme' }; // same display name, different organization
  const ph = { role: 'PHARMACY', organizationId: '6', organization: 'Ph' };
  const admin = { role: 'ADMIN', organizationId: '', organization: 'Medivra Systems' };
  const tr = (status) => ({ from: 'Acme', fromOrgId: '5', to: 'Ph', toOrgId: '6', status });
  assert.equal(canDispatch(dist, tr('Pending')), true);
  assert.equal(canDispatch(dist, tr('In Transit')), false);
  assert.equal(canDispatch(other, tr('Pending')), false);
  assert.equal(canDispatch(admin, tr('Pending')), false);
  assert.equal(canDispatch(ph, tr('Pending')), false);
  assert.equal(canCancel(dist, tr('Pending')), true);
  assert.equal(canCancel(dist, tr('In Transit')), false); // backend: only Pending can be cancelled
  assert.equal(canConfirmDelivery(ph, tr('In Transit')), true);
  assert.equal(canConfirmDelivery(ph, tr('Delivered')), false);
  assert.equal(canConfirmDelivery({ ...ph, organizationId: '7' }, tr('In Transit')), false);
  assert.equal(canConfirmDelivery(dist, tr('In Transit')), false);
  assert.equal(canEditBatch(dist, { ownerId: '5' }), true);
  assert.equal(canEditBatch(other, { ownerId: '5' }), false);
  assert.equal(canEditBatch(admin, { ownerId: '5' }), false);
});

await t('mapTransfer keeps item-level batch traceability', async () => {
  const x = mapTransfer({ id: '2', reference: 'TRF-000002', status: 'DELIVERED', statusLabel: 'Delivered', fromOrganizationId: '5', fromOrganization: 'A', toOrganizationId: '6', toOrganization: 'P', items: [{ batchId: '1', batchNumber: 'DEMO-001', medicineName: 'Para', manufacturer: 'M', expiryDate: '2030-01-01', quantity: 30, receivedQuantity: 30 }, { batchId: '2', batchNumber: 'X-2', medicineName: 'Amox', manufacturer: 'M', expiryDate: '2031-01-01', quantity: 5, receivedQuantity: 5 }], totalQuantity: 35, expectedDelivery: null, notes: '', cancelReason: null, createdAt: '2026-10-12T01:00:00.000Z', dispatchedAt: null, deliveredAt: null, cancelledAt: null, timeline: [] });
  assert.equal(x.items.length, 2);
  assert.deepEqual([x.items[0].batchNo, x.items[0].expiryDate, x.items[1].receivedQuantity, x.receivedQuantity, x.medicine], ['DEMO-001', '2030-01-01', 5, 35, 'Para (+1 more)']);
});

console.log(`\n${passed} smoke tests passed`);
