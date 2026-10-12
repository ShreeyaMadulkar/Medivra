'use strict';
const { z } = require('zod');
const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { parseQuery, pageQuery, limitClause, pagination, todayUtc } = require('../utils/http');
const { encrypt, decrypt } = require('../utils/fieldCrypto');
const audit = require('./audit.service');

const NOTES_CTX = 'transfers.notes';
const LABEL = { PENDING: 'Pending', IN_TRANSIT: 'In Transit', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const ref = (id) => `TRF-${String(id).padStart(6, '0')}`;
const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Allowed transitions (the ONLY ones; everything else is 409 INVALID_STATUS_TRANSITION):
 *   PENDING    -> IN_TRANSIT  (dispatch, sending distributor)   stock deducted from sender, once
 *   IN_TRANSIT -> DELIVERED   (receive, receiving pharmacy)     stock added to receiver, once
 *   PENDING    -> CANCELLED   (cancel, sending distributor)     no stock was ever moved
 */
const invalidTransition = (status, wanted) =>
  new HttpError(409, 'INVALID_STATUS_TRANSITION', `A ${LABEL[status].toLowerCase()} transfer cannot be ${wanted}.`, { currentStatus: status });

/* ------------------------------------------------------------------ reads */

/** Pharmacies never see PENDING/CANCELLED transfers: those are the distributor's drafts. */
function visibility(user) {
  if (user.role === 'ADMIN') return { sql: '1=1', params: [] };
  if (user.role === 'DISTRIBUTOR') return { sql: 't.from_org_id = ?', params: [String(user.organizationId)] };
  return { sql: "t.to_org_id = ? AND t.status IN ('IN_TRANSIT','DELIVERED')", params: [String(user.organizationId)] };
}

const T_SELECT = `SELECT t.id, t.from_org_id, t.to_org_id, t.status, t.notes_encrypted, DATE_FORMAT(t.expected_delivery, '%Y-%m-%d') AS expected_delivery,
    t.cancel_reason, t.created_at, t.dispatched_at, t.delivered_at, t.cancelled_at,
    fo.name AS from_name, tro.name AS to_name, cu.name AS created_by_name, du.name AS dispatched_by_name,
    ru.name AS received_by_name, xu.name AS cancelled_by_name
  FROM transfers t
  JOIN organizations fo ON fo.id = t.from_org_id
  JOIN organizations tro ON tro.id = t.to_org_id
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users du ON du.id = t.dispatched_by
  LEFT JOIN users ru ON ru.id = t.received_by
  LEFT JOIN users xu ON xu.id = t.cancelled_by`;

async function attachItems(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const [items] = await pool.execute(
    `SELECT ti.transfer_id, ti.batch_id, ti.quantity, ti.received_quantity, b.batch_number, b.medicine_name, b.manufacturer,
            DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date, b.origin_org_id
       FROM transfer_items ti JOIN batches b ON b.id = ti.batch_id
      WHERE ti.transfer_id IN (${ids.map(() => '?').join(',')}) ORDER BY ti.transfer_id, ti.id`,
    ids,
  );
  const by = new Map();
  for (const i of items) {
    const k = String(i.transfer_id);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({
      batchId: String(i.batch_id),
      batchNumber: i.batch_number,
      medicineName: i.medicine_name,
      manufacturer: i.manufacturer,
      expiryDate: i.expiry_date,
      quantity: Number(i.quantity),
      receivedQuantity: i.received_quantity == null ? null : Number(i.received_quantity),
    });
  }
  return rows.map((r) => {
    const its = by.get(String(r.id)) || [];
    const timeline = [{ at: iso(r.created_at), event: 'CREATED', by: r.created_by_name }];
    if (r.dispatched_at) timeline.push({ at: iso(r.dispatched_at), event: 'DISPATCHED', by: r.dispatched_by_name });
    if (r.delivered_at) timeline.push({ at: iso(r.delivered_at), event: 'DELIVERED', by: r.received_by_name });
    if (r.cancelled_at) timeline.push({ at: iso(r.cancelled_at), event: 'CANCELLED', by: r.cancelled_by_name });
    return {
      id: String(r.id),
      reference: ref(r.id),
      status: r.status,
      statusLabel: LABEL[r.status],
      fromOrganizationId: String(r.from_org_id),
      fromOrganization: r.from_name,
      toOrganizationId: String(r.to_org_id),
      toOrganization: r.to_name,
      items: its,
      totalQuantity: its.reduce((a, i) => a + i.quantity, 0),
      expectedDelivery: r.expected_delivery,
      notes: r.notes_encrypted ? decrypt(r.notes_encrypted, NOTES_CTX) : '',
      cancelReason: r.cancel_reason || null,
      createdAt: iso(r.created_at),
      dispatchedAt: iso(r.dispatched_at),
      deliveredAt: iso(r.delivered_at),
      cancelledAt: iso(r.cancelled_at),
      timeline,
    };
  });
}

const listQuery = z.object({
  ...pageQuery,
  status: z.enum(['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']).optional(),
  fromOrganizationId: z.string().regex(/^\d+$/).optional(), // honoured for ADMIN only (others are pinned to their org)
  toOrganizationId: z.string().regex(/^\d+$/).optional(),
});

async function list(user, rawQuery) {
  const q = parseQuery(listQuery, rawQuery);
  const v = visibility(user);
  const where = [v.sql];
  const params = [...v.params];
  if (q.status) { where.push('t.status = ?'); params.push(q.status); }
  if (user.role === 'ADMIN') {
    if (q.fromOrganizationId) { where.push('t.from_org_id = ?'); params.push(q.fromOrganizationId); }
    if (q.toOrganizationId) { where.push('t.to_org_id = ?'); params.push(q.toOrganizationId); }
  }
  const w = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM transfers t ${w}`, params);
  const [rows] = await pool.execute(`${T_SELECT} ${w} ORDER BY t.id DESC ${limitClause(q)}`, params);
  return { transfers: await attachItems(rows), pagination: pagination(q, Number(total)) };
}

async function getOne(user, id) {
  const v = visibility(user);
  const [rows] = await pool.execute(`${T_SELECT} WHERE t.id = ? AND ${v.sql}`, [id, ...v.params]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Transfer not found.'); // not found == not yours
  return { transfer: (await attachItems(rows))[0] };
}

/* ------------------------------------------------------------------ create (DISTRIBUTOR) */

async function create(actor, { toOrganizationId, items, expectedDelivery, notes }) {
  if (expectedDelivery && expectedDelivery < todayUtc()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Expected delivery cannot be in the past.', { details: { expectedDelivery: 'Expected delivery cannot be in the past.' } });
  }
  const from = String(actor.organizationId);
  const notesEnc = notes ? encrypt(notes, NOTES_CTX) : null;

  const id = await withTransaction(async (conn) => {
    const [dest] = await conn.execute('SELECT id, type, status FROM organizations WHERE id = ?', [toOrganizationId]);
    if (!dest[0] || dest[0].type !== 'PHARMACY' || dest[0].status !== 'ACTIVE') {
      throw new HttpError(400, 'INVALID_DESTINATION', 'Destination must be an active pharmacy organization.', { details: { toOrganizationId: 'Destination must be an active pharmacy organization.' } });
    }
    // Advisory check only: stock is NOT reserved while PENDING. The authoritative locked check happens at dispatch.
    for (const it of items) {
      const [rows] = await conn.execute(
        `SELECT i.quantity, b.expiry_date <= CURDATE() AS expired
           FROM inventory i JOIN batches b ON b.id = i.batch_id WHERE i.organization_id = ? AND i.batch_id = ?`,
        [from, it.batchId],
      );
      if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', `Batch ${it.batchId} was not found in your inventory.`);
      if (Number(rows[0].expired)) throw new HttpError(409, 'BATCH_EXPIRED', `Batch ${it.batchId} is expired and cannot be transferred.`);
      if (Number(rows[0].quantity) < it.quantity) {
        throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${rows[0].quantity} unit(s) of batch ${it.batchId} are available.`, { batchId: it.batchId, available: Number(rows[0].quantity), requested: it.quantity });
      }
    }
    const [r] = await conn.execute(
      'INSERT INTO transfers (from_org_id, to_org_id, notes_encrypted, expected_delivery, created_by) VALUES (?, ?, ?, ?, ?)',
      [from, toOrganizationId, notesEnc, expectedDelivery || null, String(actor.userId)],
    );
    for (const it of [...items].sort((a, b) => Number(a.batchId) - Number(b.batchId))) {
      await conn.execute('INSERT INTO transfer_items (transfer_id, batch_id, quantity) VALUES (?, ?, ?)', [String(r.insertId), it.batchId, it.quantity]);
    }
    await audit.record(conn, actor, {
      action: 'TRANSFER_CREATED', entityType: 'TRANSFER', entityId: r.insertId,
      details: { toOrganizationId, items: items.map((i) => ({ batchId: i.batchId, quantity: i.quantity })) },
    });
    return String(r.insertId);
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

/* ------------------------------------------------------------------ shared lock helper */

/**
 * Locks the transfer row (FOR UPDATE) so concurrent requests on the same transfer run one at a time.
 * `side` pins it to the caller's own organization; anything else looks like "not found".
 */
async function lockTransfer(conn, id, side, orgId) {
  const col = side === 'from' ? 'from_org_id' : 'to_org_id';
  const [rows] = await conn.execute(`SELECT id, from_org_id, to_org_id, status FROM transfers WHERE id = ? AND ${col} = ? FOR UPDATE`, [id, String(orgId)]);
  return rows[0] || null;
}
const lockItems = async (conn, id) =>
  (await conn.execute('SELECT id, batch_id, quantity FROM transfer_items WHERE transfer_id = ? ORDER BY batch_id', [id]))[0];

/* ------------------------------------------------------------------ dispatch (DISTRIBUTOR): PENDING -> IN_TRANSIT */

async function dispatch(actor, id) {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, id, 'from', actor.organizationId);
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'PENDING') throw invalidTransition(t.status, 'dispatched');

    const [dest] = await conn.execute('SELECT status FROM organizations WHERE id = ?', [String(t.to_org_id)]);
    if (!dest[0] || dest[0].status !== 'ACTIVE') throw new HttpError(409, 'INVALID_DESTINATION', 'The destination organization is not active.');

    const from = String(t.from_org_id);
    for (const it of await lockItems(conn, id)) {
      // Batches are visited in ascending id order everywhere, so concurrent dispatches cannot deadlock each other.
      const [inv] = await conn.execute(
        `SELECT i.quantity, b.expiry_date <= CURDATE() AS expired
           FROM inventory i JOIN batches b ON b.id = i.batch_id
          WHERE i.organization_id = ? AND i.batch_id = ? FOR UPDATE OF i`,
        [from, String(it.batch_id)],
      );
      const available = inv[0] ? Number(inv[0].quantity) : 0;
      if (!inv[0] || available < it.quantity) {
        throw new HttpError(409, 'INSUFFICIENT_STOCK', `Not enough stock for batch ${it.batch_id} (available ${available}, needed ${it.quantity}).`, { batchId: String(it.batch_id), available, requested: Number(it.quantity) });
      }
      if (Number(inv[0].expired)) throw new HttpError(409, 'BATCH_EXPIRED', `Batch ${it.batch_id} is expired and cannot be dispatched.`);
      const [u] = await conn.execute(
        'UPDATE inventory SET quantity = quantity - ? WHERE organization_id = ? AND batch_id = ? AND quantity >= ?',
        [it.quantity, from, String(it.batch_id), it.quantity],
      );
      if (u.affectedRows !== 1) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Stock changed; please retry.');
      await audit.record(conn, actor, {
        action: 'STOCK_DEDUCTED', entityType: 'BATCH', entityId: it.batch_id,
        details: { transferId: String(id), before: available, after: available - Number(it.quantity), quantity: Number(it.quantity) },
      });
    }
    const [s] = await conn.execute(
      "UPDATE transfers SET status = 'IN_TRANSIT', dispatched_at = NOW(3), dispatched_by = ? WHERE id = ? AND status = 'PENDING'",
      [String(actor.userId), id],
    );
    if (s.affectedRows !== 1) throw invalidTransition('IN_TRANSIT', 'dispatched');
    await audit.record(conn, actor, { action: 'TRANSFER_DISPATCHED', entityType: 'TRANSFER', entityId: id, details: { toOrganizationId: String(t.to_org_id) } });
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

/* ------------------------------------------------------------------ receive (PHARMACY): IN_TRANSIT -> DELIVERED */

async function receive(actor, id) {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, id, 'to', actor.organizationId);
    // PENDING/CANCELLED transfers are invisible to the pharmacy, so they look like "not found".
    if (!t || t.status === 'PENDING' || t.status === 'CANCELLED') throw new HttpError(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'IN_TRANSIT') throw invalidTransition(t.status, 'received again');

    const to = String(t.to_org_id);
    for (const it of await lockItems(conn, id)) {
      // Adds the dispatched quantity to the receiver. NOTHING is deducted here: the sender was debited at dispatch.
      await conn.execute(
        'INSERT INTO inventory (organization_id, batch_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
        [to, String(it.batch_id), it.quantity, it.quantity],
      );
      const [after] = await conn.execute('SELECT quantity FROM inventory WHERE organization_id = ? AND batch_id = ?', [to, String(it.batch_id)]);
      await conn.execute('UPDATE transfer_items SET received_quantity = quantity WHERE id = ?', [String(it.id)]);
      await audit.record(conn, actor, {
        action: 'STOCK_RECEIVED', entityType: 'BATCH', entityId: it.batch_id,
        details: { transferId: String(id), before: Number(after[0].quantity) - Number(it.quantity), after: Number(after[0].quantity), quantity: Number(it.quantity) },
      });
    }
    const [s] = await conn.execute(
      "UPDATE transfers SET status = 'DELIVERED', delivered_at = NOW(3), received_by = ? WHERE id = ? AND status = 'IN_TRANSIT'",
      [String(actor.userId), id],
    );
    if (s.affectedRows !== 1) throw invalidTransition('DELIVERED', 'received again');
    await audit.record(conn, actor, { action: 'TRANSFER_RECEIVED', entityType: 'TRANSFER', entityId: id, details: { fromOrganizationId: String(t.from_org_id) } });
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

/* ------------------------------------------------------------------ cancel (DISTRIBUTOR): PENDING -> CANCELLED */

async function cancel(actor, id, { reason } = {}) {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, id, 'from', actor.organizationId);
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'Transfer not found.');
    // Once dispatched, stock has left the sender, so cancelling would have to invent a return flow. Not supported.
    if (t.status !== 'PENDING') throw invalidTransition(t.status, 'cancelled');
    const [s] = await conn.execute(
      "UPDATE transfers SET status = 'CANCELLED', cancelled_at = NOW(3), cancelled_by = ?, cancel_reason = ? WHERE id = ? AND status = 'PENDING'",
      [String(actor.userId), reason || null, id],
    );
    if (s.affectedRows !== 1) throw invalidTransition('CANCELLED', 'cancelled');
    await audit.record(conn, actor, { action: 'TRANSFER_CANCELLED', entityType: 'TRANSFER', entityId: id, details: { reason: reason || null, stockMoved: false } });
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

module.exports = { list, getOne, create, dispatch, receive, cancel };
