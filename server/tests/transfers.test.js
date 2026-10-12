'use strict';
/** Phase 2: transfer workflow, stock correctness, invalid transitions, duplicate requests, concurrency, audit trail. */
const kit = require('./helpers/testkit'); // must be first (sets env)
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, makeActor, makeBatch, batchBody, stock, auditCount } = kit;

kit.useServer();
let admin; let dist; let ph1; let ph2;
before(async () => {
  admin = await makeActor('ADMIN');
  dist = await makeActor('DISTRIBUTOR', 'tr');
  ph1 = await makeActor('PHARMACY', 'tr1');
  ph2 = await makeActor('PHARMACY', 'tr2');
});

const create = (batchId, quantity, extra = {}, to = ph1) =>
  api('POST', '/api/transfers', { toOrganizationId: to.orgId, items: [{ batchId, quantity }], ...extra }, dist.token);
const dispatch = (id, who = dist) => api('POST', `/api/transfers/${id}/dispatch`, undefined, who.token);
const receive = (id, who = ph1) => api('POST', `/api/transfers/${id}/receive`, undefined, who.token);
const cancel = (id, who = dist, body = { reason: 'Changed plans' }) => api('POST', `/api/transfers/${id}/cancel`, body, who.token);
const tally = (rs) => rs.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});

test('full workflow PENDING -> IN_TRANSIT -> DELIVERED moves stock exactly once', async () => {
  const b = await makeBatch(dist, { quantity: 100 });
  const c = await create(b.id, 30, { notes: 'Fragile - call 98765 on arrival', expectedDelivery: kit.plusYears(1) });
  assert.equal(c.status, 201);
  const t = c.json.transfer;
  assert.equal(t.status, 'PENDING');
  assert.equal(t.fromOrganizationId, dist.orgId);
  assert.equal(t.toOrganizationId, ph1.orgId);
  assert.equal(t.notes, 'Fragile - call 98765 on arrival'); // decrypted on read
  assert.equal(t.items[0].batchNumber, b.batchNumber); // traceable to the source batch...
  assert.equal(t.items[0].expiryDate, b.expiryDate); // ...and its expiry
  assert.equal(await stock(dist.orgId, b.id), 100); // PENDING reserves nothing

  const [[raw]] = await pool.execute('SELECT notes_encrypted FROM transfers WHERE id = ?', [t.id]);
  assert.ok(raw.notes_encrypted.startsWith('v1:'));
  assert.ok(!raw.notes_encrypted.includes('Fragile')); // AES-256-GCM at rest

  assert.equal((await api('GET', `/api/transfers/${t.id}`, undefined, ph1.token)).status, 404); // pharmacy cannot see PENDING drafts
  assert.equal((await api('GET', '/api/transfers', undefined, ph1.token)).json.transfers.length, 0);
  assert.equal((await receive(t.id)).status, 404);

  const d = await dispatch(t.id);
  assert.equal(d.status, 200);
  assert.equal(d.json.transfer.status, 'IN_TRANSIT');
  assert.equal(await stock(dist.orgId, b.id), 70); // deducted at dispatch
  assert.equal(await stock(ph1.orgId, b.id), null); // not yet in the pharmacy's stock
  const sumD = (await api('GET', '/api/inventory/summary', undefined, dist.token)).json.summary;
  assert.equal(sumD.inTransitOutUnits, 30); // tracked separately: never double counted
  assert.equal(sumD.availableUnits, 70);
  assert.equal((await api('GET', '/api/inventory/summary', undefined, ph1.token)).json.summary.inTransitInUnits, 30);
  assert.equal((await api('GET', `/api/transfers/${t.id}`, undefined, ph1.token)).status, 200); // visible once in transit

  const r = await receive(t.id);
  assert.equal(r.status, 200);
  assert.equal(r.json.transfer.status, 'DELIVERED');
  assert.equal(r.json.transfer.items[0].receivedQuantity, 30);
  assert.equal(await stock(ph1.orgId, b.id), 30); // added to the pharmacy
  assert.equal(await stock(dist.orgId, b.id), 70); // NOT deducted again at receipt
  const sumP = (await api('GET', '/api/inventory/summary', undefined, ph1.token)).json.summary;
  assert.equal(sumP.availableUnits, 30);
  assert.equal(sumP.inTransitInUnits, 0);
  const pb = await api('GET', `/api/batches/${b.id}`, undefined, ph1.token); // pharmacy now sees the batch with traceable metadata
  assert.equal(pb.status, 200);
  assert.equal(pb.json.batch.quantity, 30);
  assert.equal(pb.json.batch.expiryDate, b.expiryDate);
  assert.equal(pb.json.batch.originOrganizationId, dist.orgId);
  // total conserved: 70 + 30 = 100
});

test('audit trail records creation, dispatch, stock changes and receipt with the right actors', async () => {
  const b = await makeBatch(dist, { quantity: 40 });
  const t = (await create(b.id, 15)).json.transfer;
  await dispatch(t.id);
  await receive(t.id);
  const logs = (await api('GET', `/api/audit-logs?entityType=TRANSFER&limit=100`, undefined, admin.token)).json.auditLogs.filter((l) => l.entityId === t.id);
  assert.deepEqual(logs.map((l) => l.action).sort(), ['TRANSFER_CREATED', 'TRANSFER_DISPATCHED', 'TRANSFER_RECEIVED']);
  assert.equal(logs.find((l) => l.action === 'TRANSFER_RECEIVED').actorId, ph1.userId);
  assert.equal(logs.find((l) => l.action === 'TRANSFER_DISPATCHED').actorId, dist.userId);
  const [[ded]] = await pool.execute("SELECT details FROM audit_logs WHERE action = 'STOCK_DEDUCTED' AND entity_id = ? ORDER BY id DESC LIMIT 1", [b.id]);
  assert.deepEqual([ded.details.before, ded.details.after, ded.details.quantity], [40, 25, 15]);
  const [[rec]] = await pool.execute("SELECT details FROM audit_logs WHERE action = 'STOCK_RECEIVED' AND entity_id = ? ORDER BY id DESC LIMIT 1", [b.id]);
  assert.deepEqual([rec.details.before, rec.details.after], [0, 15]);
  assert.ok(!JSON.stringify(logs).includes('Fragile'));
});

test('invalid transfers: destination, stock, batches, items, expired stock', async () => {
  const b = await makeBatch(dist, { quantity: 10 });
  const other = await makeActor('DISTRIBUTOR', 'tr-other');
  const base = { items: [{ batchId: b.id, quantity: 1 }] };
  const post = (body) => api('POST', '/api/transfers', body, dist.token);
  assert.equal((await post({ ...base, toOrganizationId: other.orgId })).status, 400); // destination must be a pharmacy
  assert.equal((await post({ ...base, toOrganizationId: dist.orgId })).status, 400); // not yourself
  assert.equal((await post({ ...base, toOrganizationId: '99999999' })).status, 400); // does not exist
  assert.equal((await post({ ...base, toOrganizationId: 'abc' })).status, 400);
  const tooMany = await create(b.id, 11);
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.json.error.code, 'INSUFFICIENT_STOCK');
  for (const quantity of [0, -3, 1.5, '2']) assert.equal((await create(b.id, quantity)).status, 400, String(quantity));
  assert.equal((await create('99999999', 1)).status, 404);
  assert.equal((await post({ toOrganizationId: ph1.orgId, items: [] })).status, 400);
  assert.equal((await post({ toOrganizationId: ph1.orgId, items: [{ batchId: b.id, quantity: 1 }, { batchId: b.id, quantity: 2 }] })).status, 400);
  assert.equal((await post({ ...base, toOrganizationId: ph1.orgId, fromOrgId: dist.orgId })).status, 400); // strict: no client org ids
  assert.equal((await post({ ...base, toOrganizationId: ph1.orgId, expectedDelivery: '2020-01-01' })).status, 400);
  // an expired batch (inserted directly: the API refuses to register one) cannot be transferred
  const [r] = await pool.execute(
    'INSERT INTO batches (origin_org_id, batch_number, medicine_name, manufacturer, manufacture_date, expiry_date, original_quantity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [dist.orgId, `EXP${kit.uniq()}`.toUpperCase(), 'Old Medicine', 'Acme', '2020-01-01', '2021-01-01', 10, dist.userId]);
  await pool.execute('INSERT INTO inventory (organization_id, batch_id, quantity) VALUES (?, ?, 10)', [dist.orgId, String(r.insertId)]);
  const ex = await create(String(r.insertId), 1);
  assert.equal(ex.status, 409);
  assert.equal(ex.json.error.code, 'BATCH_EXPIRED');
  assert.equal(await stock(dist.orgId, b.id), 10);
});

test('duplicate dispatch and duplicate receipt are rejected and never change stock again', async () => {
  const b = await makeBatch(dist, { quantity: 50 });
  const t = (await create(b.id, 20)).json.transfer;
  assert.equal((await dispatch(t.id)).status, 200);
  const again = await dispatch(t.id);
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'INVALID_STATUS_TRANSITION');
  assert.equal(await stock(dist.orgId, b.id), 30); // deducted once
  assert.equal((await receive(t.id)).status, 200);
  const again2 = await receive(t.id);
  assert.equal(again2.status, 409);
  assert.equal(again2.json.error.code, 'INVALID_STATUS_TRANSITION');
  assert.equal(await stock(ph1.orgId, b.id), 20); // added once
  assert.equal((await dispatch(t.id)).status, 409); // cannot re-dispatch a delivered transfer
  assert.equal((await cancel(t.id)).status, 409); // cannot cancel delivered
  assert.equal(await stock(dist.orgId, b.id), 30);
  assert.equal(await auditCount("action = 'STOCK_DEDUCTED' AND entity_id = ?", [b.id]), 1);
  assert.equal(await auditCount("action = 'STOCK_RECEIVED' AND entity_id = ?", [b.id]), 1);
});

test('cancellation: only PENDING, moves no stock, blocks later steps', async () => {
  const b = await makeBatch(dist, { quantity: 60 });
  const t = (await create(b.id, 25)).json.transfer;
  const c = await cancel(t.id);
  assert.equal(c.status, 200);
  assert.equal(c.json.transfer.status, 'CANCELLED');
  assert.equal(c.json.transfer.cancelReason, 'Changed plans');
  assert.equal(await stock(dist.orgId, b.id), 60); // nothing created or restored
  assert.equal(await stock(ph1.orgId, b.id), null);
  assert.equal((await dispatch(t.id)).status, 409);
  assert.equal((await receive(t.id)).status, 404); // pharmacy never saw it
  assert.equal((await cancel(t.id)).status, 409); // already cancelled
  assert.equal(await auditCount("action = 'TRANSFER_CANCELLED' AND entity_id = ?", [t.id]), 1);
  // in-transit transfers cannot be cancelled (stock already left the sender)
  const t2 = (await create(b.id, 10)).json.transfer;
  await dispatch(t2.id);
  const noCancel = await cancel(t2.id);
  assert.equal(noCancel.status, 409);
  assert.equal(await stock(dist.orgId, b.id), 50);
  assert.equal((await cancel(t2.id, admin)).status, 403);
});

test('dispatch re-checks stock under lock: a second oversubscribed transfer fails cleanly and stays PENDING', async () => {
  const b = await makeBatch(dist, { quantity: 100 });
  const t1 = (await create(b.id, 60)).json.transfer;
  const t2 = (await create(b.id, 60)).json.transfer; // allowed at creation: PENDING reserves nothing
  assert.equal((await dispatch(t1.id)).status, 200);
  const r = await dispatch(t2.id);
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(await stock(dist.orgId, b.id), 40); // no negative stock, no partial deduction
  assert.equal((await api('GET', `/api/transfers/${t2.id}`, undefined, dist.token)).json.transfer.status, 'PENDING');
  assert.equal(await auditCount("action = 'TRANSFER_DISPATCHED' AND entity_id = ?", [t2.id]), 0); // rolled back with the transaction
  // top up, then the same transfer can be dispatched
  assert.equal((await api('POST', `/api/inventory/${b.id}/adjust`, { delta: 30, reason: 'Restock' }, dist.token)).status, 200);
  assert.equal((await dispatch(t2.id)).status, 200);
  assert.equal(await stock(dist.orgId, b.id), 10);
});

test('multi-item transfers are atomic: one short item rolls back every deduction', async () => {
  const a = await makeBatch(dist, { quantity: 50 });
  const b = await makeBatch(dist, { quantity: 5 });
  const t = await api('POST', '/api/transfers', { toOrganizationId: ph1.orgId, items: [{ batchId: a.id, quantity: 10 }, { batchId: b.id, quantity: 5 }] }, dist.token);
  assert.equal(t.status, 201);
  await api('POST', `/api/inventory/${b.id}/adjust`, { delta: -3, reason: 'Damaged' }, dist.token); // b now has only 2
  const d = await dispatch(t.json.transfer.id);
  assert.equal(d.status, 409);
  assert.equal(await stock(dist.orgId, a.id), 50); // item A was NOT deducted
  assert.equal(await stock(dist.orgId, b.id), 2);
  await api('POST', `/api/inventory/${b.id}/adjust`, { delta: 3, reason: 'Found' }, dist.token);
  assert.equal((await dispatch(t.json.transfer.id)).status, 200);
  assert.equal((await receive(t.json.transfer.id)).status, 200);
  assert.equal(await stock(ph1.orgId, a.id), 10);
  assert.equal(await stock(ph1.orgId, b.id), 5);
});

test('receiving the same batch twice accumulates in the pharmacy inventory', async () => {
  const b = await makeBatch(dist, { quantity: 100 });
  for (const q of [10, 15]) {
    const t = (await create(b.id, q)).json.transfer;
    await dispatch(t.id);
    assert.equal((await receive(t.id)).status, 200);
  }
  assert.equal(await stock(ph1.orgId, b.id), 25);
  assert.equal(await stock(dist.orgId, b.id), 75);
});

test('CONCURRENCY: oversubscribed dispatches never oversell', async () => {
  const b = await makeBatch(dist, { quantity: 10 });
  const ids = [];
  for (let i = 0; i < 5; i += 1) ids.push((await create(b.id, 4)).json.transfer.id); // 5 x 4 = 20 requested, only 10 exist
  const results = await Promise.all(ids.map((id) => dispatch(id)));
  const t = tally(results);
  assert.equal(t[200], 2, JSON.stringify(t));
  assert.equal(t[409], 3, JSON.stringify(t));
  assert.equal(await stock(dist.orgId, b.id), 2); // 10 - 2*4, never negative
  const [[inTransit]] = await pool.execute(
    "SELECT COALESCE(SUM(i.quantity),0) AS q FROM transfer_items i JOIN transfers t ON t.id = i.transfer_id WHERE t.status = 'IN_TRANSIT' AND i.batch_id = ?", [b.id]);
  assert.equal(Number(inTransit.q), 8);
  assert.equal(await auditCount("action = 'STOCK_DEDUCTED' AND entity_id = ?", [b.id]), 2);
});

test('CONCURRENCY: the same transfer dispatched many times deducts once; received many times credits once', async () => {
  const b = await makeBatch(dist, { quantity: 100 });
  const t = (await create(b.id, 30)).json.transfer;
  const ds = await Promise.all(Array.from({ length: 6 }, () => dispatch(t.id)));
  assert.deepEqual(tally(ds), { 200: 1, 409: 5 });
  assert.equal(await stock(dist.orgId, b.id), 70);
  const rs = await Promise.all(Array.from({ length: 6 }, () => receive(t.id)));
  assert.deepEqual(tally(rs), { 200: 1, 409: 5 });
  assert.equal(await stock(ph1.orgId, b.id), 30);
  assert.equal(await stock(dist.orgId, b.id), 70);
  assert.equal(await auditCount("action = 'TRANSFER_DISPATCHED' AND entity_id = ?", [t.id]), 1);
});

test('CONCURRENCY: dispatch vs cancel and dispatch vs manual stock adjustment stay consistent', async () => {
  const b = await makeBatch(dist, { quantity: 20 });
  const t = (await create(b.id, 20)).json.transfer;
  const [d, c] = await Promise.all([dispatch(t.id), cancel(t.id)]);
  assert.deepEqual([d.status, c.status].sort(), [200, 409]); // exactly one wins
  const final = (await api('GET', `/api/transfers/${t.id}`, undefined, dist.token)).json.transfer.status;
  assert.equal(await stock(dist.orgId, b.id), final === 'IN_TRANSIT' ? 0 : 20);

  const b2 = await makeBatch(dist, { quantity: 10 });
  const t2 = (await create(b2.id, 10)).json.transfer;
  const [d2, a2] = await Promise.all([dispatch(t2.id), api('POST', `/api/inventory/${b2.id}/adjust`, { delta: -5, reason: 'Damaged' }, dist.token)]);
  const left = await stock(dist.orgId, b2.id);
  assert.ok(left >= 0);
  assert.ok((d2.status === 200 && a2.status === 409 && left === 0) || (d2.status === 409 && a2.status === 200 && left === 5), `${d2.status}/${a2.status}/${left}`);
});

test('ADMIN can read transfers but not act on them', async () => {
  const b = await makeBatch(dist, { quantity: 10 });
  const t = (await create(b.id, 5)).json.transfer;
  assert.equal((await api('GET', `/api/transfers/${t.id}`, undefined, admin.token)).status, 200);
  assert.equal((await api('GET', `/api/transfers?status=PENDING&fromOrganizationId=${dist.orgId}`, undefined, admin.token)).json.transfers.some((x) => x.id === t.id), true);
  assert.equal((await dispatch(t.id, admin)).status, 403);
  assert.equal((await receive(t.id, admin)).status, 403);
  assert.equal(await stock(dist.orgId, b.id), 10);
  await dispatch(t.id);
  assert.equal((await receive(t.id, ph2)).status, 404); // wrong pharmacy
  assert.equal((await receive(t.id, admin)).status, 403);
  assert.equal(await stock(ph2.orgId, b.id), null);
});

test('transfer listing is paginated, filterable and scoped per role', async () => {
  const d = await makeActor('DISTRIBUTOR', 'tr-page');
  const p = await makeActor('PHARMACY', 'tr-page');
  const b = (await api('POST', '/api/batches', batchBody({ quantity: 100 }), d.token)).json.batch;
  const made = [];
  for (let i = 0; i < 3; i += 1) made.push((await api('POST', '/api/transfers', { toOrganizationId: p.orgId, items: [{ batchId: b.id, quantity: 1 }] }, d.token)).json.transfer.id);
  await api('POST', `/api/transfers/${made[0]}/dispatch`, undefined, d.token);
  const l = await api('GET', '/api/transfers?limit=2&page=1', undefined, d.token);
  assert.deepEqual(l.json.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  assert.equal(l.json.transfers[0].id, made[2]); // newest first
  assert.equal((await api('GET', '/api/transfers?status=IN_TRANSIT', undefined, d.token)).json.transfers.length, 1);
  assert.equal((await api('GET', '/api/transfers', undefined, p.token)).json.pagination.total, 1); // only the in-transit one
  assert.equal((await api('GET', '/api/transfers?status=NOPE', undefined, d.token)).status, 400);
});
