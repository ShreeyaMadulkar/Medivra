'use strict';
/** Phase 2: batches, validation, duplicates, DB constraints, stock adjustments, listing/pagination, summaries. */
const kit = require('./helpers/testkit'); // must be first (sets env)
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, makeActor, makeBatch, batchBody, stock, auditCount, plusYears } = kit;

kit.useServer();
let dist; let dist2; let ph;
before(async () => {
  dist = await makeActor('DISTRIBUTOR', 'inv');
  dist2 = await makeActor('DISTRIBUTOR', 'inv2');
  ph = await makeActor('PHARMACY', 'inv');
});

test('creating a batch stores it, creates the inventory row and writes audit entries', async () => {
  const body = batchBody({ batchNumber: 'ab-100/x', quantity: 250, unitPrice: 12.75, notes: 'cold chain' });
  const r = await api('POST', '/api/batches', body, dist.token);
  assert.equal(r.status, 201);
  const b = r.json.batch;
  assert.equal(b.batchNumber, 'AB-100/X'); // normalised
  assert.equal(b.quantity, 250);
  assert.equal(b.originalQuantity, 250);
  assert.equal(b.unitPrice, 12.75);
  assert.equal(b.originOrganizationId, dist.orgId); // from the token's user, not the request
  assert.equal(b.manufacturer, 'Acme Pharma');
  assert.equal(await stock(dist.orgId, b.id), 250);
  assert.equal(await auditCount("action = 'BATCH_CREATED' AND entity_id = ? AND actor_user_id = ?", [b.id, dist.userId]), 1);
  assert.equal(await auditCount("action = 'STOCK_ADDED' AND entity_id = ?", [b.id]), 1);
});

test('invalid batches are rejected (quantities, dates, fields)', async () => {
  const bad = [
    { quantity: 0 }, { quantity: -5 }, { quantity: 1.5 }, { quantity: '10' }, { quantity: 20000000 }, { quantity: null },
    { unitPrice: -1 }, { unitPrice: 1.234 }, { unitPrice: 'free' },
    { manufactureDate: '2025-13-40' }, { manufactureDate: 'yesterday' }, { manufactureDate: plusYears(1) },
    { expiryDate: '2025-01-01' }, { expiryDate: '2020-01-01' }, { expiryDate: '2030-02-30' },
    { batchNumber: '' }, { batchNumber: '!!bad!!' }, { medicineName: 'x' }, { manufacturer: '' }, { category: 'Poison' },
    { owner: 'x' }, { originOrgId: '1' }, { status: 'In Stock' },
  ];
  for (const over of bad) {
    const r = await api('POST', '/api/batches', batchBody(over), dist.token);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  }
  const missing = batchBody();
  delete missing.expiryDate;
  assert.equal((await api('POST', '/api/batches', missing, dist.token)).status, 400);
});

test('duplicate batch records are rejected, but another distributor may reuse the number', async () => {
  const body = batchBody();
  assert.equal((await api('POST', '/api/batches', body, dist.token)).status, 201);
  const dup = await api('POST', '/api/batches', { ...body, batchNumber: body.batchNumber.toLowerCase() }, dist.token);
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'BATCH_EXISTS');
  assert.equal((await api('POST', '/api/batches', body, dist2.token)).status, 201);
  assert.equal((await api('POST', '/api/batches', { ...body, manufacturer: 'Other Pharma' }, dist.token)).status, 201);
});

test('database constraints back up the API (negative stock, bad dates, duplicate rows, wrong org types)', async () => {
  const b = await makeBatch(dist);
  await assert.rejects(pool.execute('UPDATE inventory SET quantity = quantity - 1000 WHERE organization_id = ? AND batch_id = ?', [dist.orgId, b.id])); // UNSIGNED/CHECK
  await assert.rejects(pool.execute('INSERT INTO inventory (organization_id, batch_id, quantity) VALUES (?, ?, 1)', [dist.orgId, b.id])); // PK duplicate
  await assert.rejects(pool.execute(
    'INSERT INTO batches (origin_org_id, batch_number, medicine_name, manufacturer, manufacture_date, expiry_date, original_quantity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [dist.orgId, 'DBX1', 'M', 'M', '2025-05-05', '2025-01-01', 5, dist.userId])); // expiry before manufacture
  await assert.rejects(pool.execute(
    'INSERT INTO batches (origin_org_id, batch_number, medicine_name, manufacturer, manufacture_date, expiry_date, original_quantity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [dist.orgId, 'DBX2', 'M', 'M', '2025-01-01', '2030-01-01', 0, dist.userId])); // zero quantity
  await assert.rejects(pool.execute('INSERT INTO transfers (from_org_id, from_org_type, to_org_id, to_org_type, created_by) VALUES (?, ?, ?, ?, ?)',
    [ph.orgId, 'PHARMACY', dist.orgId, 'DISTRIBUTOR', dist.userId])); // pharmacy cannot send / distributor cannot receive
  await assert.rejects(pool.execute('INSERT INTO transfers (from_org_id, to_org_id, created_by) VALUES (?, ?, ?)', [dist.orgId, dist2.orgId, dist.userId])); // distributor -> distributor
});

test('permitted batch updates; identity fields lock once a transfer exists; quantity is not editable here', async () => {
  const b = await makeBatch(dist, { notes: 'old' });
  const u1 = await api('PATCH', `/api/batches/${b.id}`, { unitPrice: 9.99, notes: 'new note', category: 'Antibiotic' }, dist.token);
  assert.equal(u1.status, 200);
  assert.equal(u1.json.batch.unitPrice, 9.99);
  assert.equal(u1.json.batch.category, 'Antibiotic');
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, { medicineName: 'Renamed Medicine' }, dist.token)).status, 200); // no transfer yet
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, { expiryDate: '2020-01-01' }, dist.token)).status, 400); // before manufacture date
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, { quantity: 5 }, dist.token)).status, 400);
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, { originOrgId: '1' }, dist.token)).status, 400);
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, {}, dist.token)).status, 400);
  assert.ok((await auditCount("action = 'BATCH_UPDATED' AND entity_id = ?", [b.id])) >= 2);

  const t = await api('POST', '/api/transfers', { toOrganizationId: ph.orgId, items: [{ batchId: b.id, quantity: 5 }] }, dist.token);
  assert.equal(t.status, 201);
  const locked = await api('PATCH', `/api/batches/${b.id}`, { expiryDate: plusYears(9) }, dist.token);
  assert.equal(locked.status, 409);
  assert.equal(locked.json.error.code, 'BATCH_LOCKED');
  assert.equal((await api('PATCH', `/api/batches/${b.id}`, { unitPrice: 1.5 }, dist.token)).status, 200); // price/notes stay editable
  assert.equal((await api('PATCH', '/api/batches/99999999', { notes: 'x' }, dist.token)).status, 404);
});

test('stock adjustments: allowed, audited with before/after, never negative', async () => {
  const b = await makeBatch(dist, { quantity: 20 });
  const up = await api('POST', `/api/inventory/${b.id}/adjust`, { delta: 5, reason: 'Recount' }, dist.token);
  assert.equal(up.status, 200);
  assert.deepEqual([up.json.before, up.json.after], [20, 25]);
  const down = await api('POST', `/api/inventory/${b.id}/adjust`, { delta: -25, reason: 'Damaged' }, dist.token);
  assert.equal(down.status, 200);
  assert.equal(await stock(dist.orgId, b.id), 0);
  const below = await api('POST', `/api/inventory/${b.id}/adjust`, { delta: -1, reason: 'Oops' }, dist.token);
  assert.equal(below.status, 409);
  assert.equal(below.json.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(await stock(dist.orgId, b.id), 0);
  for (const body of [{ delta: 0, reason: 'zero' }, { delta: 1.5, reason: 'frac' }, { delta: 1 }, { delta: 'x', reason: 'abc' }, { delta: 1, reason: 'ok!', extra: 1 }]) {
    assert.equal((await api('POST', `/api/inventory/${b.id}/adjust`, body, dist.token)).status, 400, JSON.stringify(body));
  }
  assert.equal(await auditCount("action = 'STOCK_ADJUSTED' AND entity_id = ?", [b.id]), 2);
});

test('inventory listing, filters, pagination, lookup and summary', async () => {
  const d = await makeActor('DISTRIBUTOR', 'inv-list');
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await makeBatch(d, { medicineName: 'Amoxicillin 250mg', category: 'Antibiotic', quantity: 500 });
  await makeBatch(d, { medicineName: 'Cetirizine 10mg', category: 'Antihistamine', quantity: 10 }); // low stock
  const near = await makeBatch(d, { medicineName: 'Insulin Glargine', category: 'Antidiabetic', quantity: 100, expiryDate: soon }); // expiring soon
  await makeBatch(d, { medicineName: 'Ibuprofen 400mg', category: 'Analgesic', quantity: 80 });

  const p1 = await api('GET', '/api/inventory?limit=3&page=1', undefined, d.token);
  assert.equal(p1.status, 200);
  assert.equal(p1.json.inventory.length, 3);
  assert.deepEqual(p1.json.pagination, { page: 1, limit: 3, total: 4, totalPages: 2 });
  const p2 = await api('GET', '/api/inventory?limit=3&page=2', undefined, d.token);
  assert.equal(p2.json.inventory.length, 1);
  assert.equal((await api('GET', '/api/inventory?q=amox', undefined, d.token)).json.inventory.length, 1);
  assert.equal((await api('GET', '/api/inventory?q=%25', undefined, d.token)).json.inventory.length, 0); // LIKE wildcard is literal
  assert.equal((await api('GET', '/api/inventory?category=Antibiotic', undefined, d.token)).json.inventory.length, 1);
  const low = await api('GET', '/api/inventory?status=low_stock', undefined, d.token);
  assert.deepEqual(low.json.inventory.map((i) => i.medicineName), ['Cetirizine 10mg']);
  const exp = await api('GET', '/api/inventory?status=expiring_soon', undefined, d.token);
  assert.deepEqual(exp.json.inventory.map((i) => i.status), ['Expiring Soon']);
  assert.equal((await api('GET', '/api/inventory?status=bogus', undefined, d.token)).status, 400);

  const look = await api('GET', `/api/inventory/${near.id}`, undefined, d.token);
  assert.equal(look.status, 200);
  assert.equal(look.json.stock.quantity, 100);
  assert.equal(look.json.stock.expiryDate, soon);
  const s = (await api('GET', '/api/inventory/summary', undefined, d.token)).json.summary;
  assert.equal(s.scope, 'ORGANIZATION');
  assert.equal(s.distinctBatches, 4);
  assert.equal(s.availableUnits, 690);
  assert.equal(s.lowStockBatches, 1);
  assert.equal(s.expiringSoonBatches, 1);
  assert.equal(s.inTransitOutUnits, 0);

  const pharm = await api('GET', '/api/inventory', undefined, ph.token);
  assert.equal(pharm.status, 200);
  assert.equal(pharm.json.inventory.length, 0); // pharmacies see only stock they hold
  assert.equal((await api('GET', `/api/inventory/${near.id}`, undefined, ph.token)).status, 404);
});
