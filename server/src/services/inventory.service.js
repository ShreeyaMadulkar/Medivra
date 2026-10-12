'use strict';
const { z } = require('zod');
const pool = require('../db/pool');
const config = require('../config/env');
const HttpError = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { parseQuery, pageQuery, limitClause, pagination, likeTerm, todayUtc } = require('../utils/http');
const audit = require('./audit.service');

const EXPIRING_DAYS = 90;
const MAX_STOCK = 2_000_000_000;

/** Display status for a stock row (computed, never stored). Dates are UTC 'YYYY-MM-DD' strings. */
function stockStatus(quantity, expiryDate) {
  const today = todayUtc();
  if (expiryDate <= today) return 'Expired';
  if (quantity <= 0) return 'Out of Stock';
  const soon = new Date(Date.now() + EXPIRING_DAYS * 86400000).toISOString().slice(0, 10);
  if (expiryDate <= soon) return 'Expiring Soon';
  if (quantity <= config.lowStockThreshold) return 'Low Stock';
  return 'In Stock';
}

const BATCH_COLS = `b.id AS batch_id, b.batch_number, b.medicine_name, b.category, b.manufacturer,
  DATE_FORMAT(b.manufacture_date, '%Y-%m-%d') AS manufacture_date, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
  b.original_quantity, b.unit_price, b.notes, b.origin_org_id, b.created_at AS batch_created_at, b.updated_at AS batch_updated_at,
  oo.name AS origin_org_name`;

function batchFields(r) {
  return {
    batchId: String(r.batch_id),
    batchNumber: r.batch_number,
    medicineName: r.medicine_name,
    category: r.category,
    manufacturer: r.manufacturer,
    manufactureDate: r.manufacture_date,
    expiryDate: r.expiry_date,
    originalQuantity: Number(r.original_quantity),
    unitPrice: Number(r.unit_price),
    notes: r.notes || '',
    originOrganizationId: String(r.origin_org_id),
    originOrganization: r.origin_org_name,
  };
}

const inventoryDto = (r) => ({
  ...batchFields(r),
  organizationId: String(r.organization_id),
  organization: r.organization_name,
  quantity: Number(r.quantity),
  status: stockStatus(Number(r.quantity), r.expiry_date),
  updatedAt: new Date(r.inv_updated_at).toISOString(),
});

/** Scope: non-admins are ALWAYS pinned to their own organization; admins may optionally filter. */
function scopeOrg(user, requestedOrgId) {
  if (user.role === 'ADMIN') return requestedOrgId || null;
  return String(user.organizationId);
}

const listQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  status: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'expiring_soon', 'expired']).optional(),
  category: z.enum(['Analgesic', 'Antibiotic', 'Antihistamine', 'Antidiabetic', 'Other']).optional(),
  organizationId: z.string().regex(/^\d+$/).optional(),
});

const STATUS_SQL = {
  expired: 'b.expiry_date <= CURDATE()',
  out_of_stock: 'b.expiry_date > CURDATE() AND i.quantity = 0',
  expiring_soon: `b.expiry_date > CURDATE() AND i.quantity > 0 AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY)`,
  low_stock: `b.expiry_date > DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY) AND i.quantity > 0 AND i.quantity <= ${Number(config.lowStockThreshold)}`,
  in_stock: `b.expiry_date > DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY) AND i.quantity > ${Number(config.lowStockThreshold)}`,
};

const FROM = `FROM inventory i
  JOIN batches b ON b.id = i.batch_id
  JOIN organizations oo ON oo.id = b.origin_org_id
  JOIN organizations org ON org.id = i.organization_id`;

async function list(user, rawQuery) {
  const q = parseQuery(listQuery, rawQuery);
  const orgId = scopeOrg(user, q.organizationId);
  const where = [];
  const params = [];
  if (orgId) { where.push('i.organization_id = ?'); params.push(orgId); }
  if (q.q) { where.push('(b.medicine_name LIKE ? OR b.batch_number LIKE ? OR b.manufacturer LIKE ?)'); params.push(likeTerm(q.q), likeTerm(q.q), likeTerm(q.q)); }
  if (q.category) { where.push('b.category = ?'); params.push(q.category); }
  if (q.status) where.push(STATUS_SQL[q.status]);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total ${FROM} ${w}`, params);
  const [rows] = await pool.execute(
    `SELECT ${BATCH_COLS}, i.organization_id, org.name AS organization_name, i.quantity, i.updated_at AS inv_updated_at
       ${FROM} ${w} ORDER BY b.expiry_date ASC, i.batch_id ASC, i.organization_id ASC ${limitClause(q)}`,
    params,
  );
  return { inventory: rows.map(inventoryDto), pagination: pagination(q, Number(total)) };
}

async function summary(user, rawQuery) {
  const q = parseQuery(z.object({ organizationId: z.string().regex(/^\d+$/).optional() }), rawQuery);
  const orgId = scopeOrg(user, q.organizationId);
  const ow = orgId ? 'WHERE i.organization_id = ?' : '';
  const op = orgId ? [orgId] : [];
  const [[s]] = await pool.execute(
    `SELECT COUNT(DISTINCT i.batch_id) AS batches,
            COALESCE(SUM(i.quantity), 0) AS units,
            COALESCE(SUM(i.quantity * b.unit_price), 0) AS value,
            COALESCE(SUM(b.expiry_date > DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY) AND i.quantity > 0 AND i.quantity <= ${Number(config.lowStockThreshold)}), 0) AS low,
            COALESCE(SUM(b.expiry_date > CURDATE() AND i.quantity = 0), 0) AS oos,
            COALESCE(SUM(b.expiry_date > CURDATE() AND i.quantity > 0 AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY)), 0) AS soon,
            COALESCE(SUM(b.expiry_date <= CURDATE() AND i.quantity > 0), 0) AS expired
       FROM inventory i JOIN batches b ON b.id = i.batch_id ${ow}`,
    op,
  );
  const tw = orgId ? 'AND t.from_org_id = ?' : '';
  const rw = orgId ? 'AND t.to_org_id = ?' : '';
  const [[out]] = await pool.execute(
    `SELECT COALESCE(SUM(ti.quantity), 0) AS units, COUNT(DISTINCT t.id) AS transfers
       FROM transfers t JOIN transfer_items ti ON ti.transfer_id = t.id WHERE t.status = 'IN_TRANSIT' ${tw}`, op);
  const [[inn]] = await pool.execute(
    `SELECT COALESCE(SUM(ti.quantity), 0) AS units, COUNT(DISTINCT t.id) AS transfers
       FROM transfers t JOIN transfer_items ti ON ti.transfer_id = t.id WHERE t.status = 'IN_TRANSIT' ${rw}`, op);
  const [[pend]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM transfers t WHERE t.status = 'PENDING' ${orgId ? 'AND t.from_org_id = ?' : ''}`, op);
  const common = {
    distinctBatches: Number(s.batches),
    availableUnits: Number(s.units),
    inventoryValue: Number(s.value),
    lowStockBatches: Number(s.low),
    outOfStockBatches: Number(s.oos),
    expiringSoonBatches: Number(s.soon),
    expiredBatchesWithStock: Number(s.expired),
    pendingTransfers: Number(pend.n),
  };
  // In-transit units are NOT part of availableUnits: they live only in transfer_items until delivery.
  const transit = orgId
    ? { inTransitOutUnits: Number(out.units), inTransitInUnits: Number(inn.units) }
    : { inTransitUnits: Number(out.units) }; // platform-wide: outgoing and incoming are the same units
  return { summary: { scope: orgId ? 'ORGANIZATION' : 'PLATFORM', organizationId: orgId, ...common, ...transit } };
}

/** Stock lookup for one batch. Non-admins: only their own row. Admin: every holder (read-only). */
async function lookup(user, batchId) {
  const orgId = user.role === 'ADMIN' ? null : String(user.organizationId);
  const [rows] = await pool.execute(
    `SELECT ${BATCH_COLS}, i.organization_id, org.name AS organization_name, i.quantity, i.updated_at AS inv_updated_at
       ${FROM} WHERE i.batch_id = ? ${orgId ? 'AND i.organization_id = ?' : ''} ORDER BY i.organization_id`,
    orgId ? [batchId, orgId] : [batchId],
  );
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'No stock found for this batch.');
  if (orgId) return { stock: inventoryDto(rows[0]) };
  return { batch: batchFields(rows[0]), holders: rows.map(inventoryDto), totalQuantity: rows.reduce((a, r) => a + Number(r.quantity), 0) };
}

/** DISTRIBUTOR: manual correction of its own stock (damage, count correction...). Always audited with before/after. */
async function adjust(actor, batchId, { delta, reason }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT quantity FROM inventory WHERE organization_id = ? AND batch_id = ? FOR UPDATE',
      [String(actor.organizationId), batchId],
    );
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Batch not found in your inventory.');
    const before = Number(rows[0].quantity);
    const after = before + delta;
    if (after < 0) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Stock cannot go below zero (available: ${before}).`);
    if (after > MAX_STOCK) throw new HttpError(400, 'VALIDATION_ERROR', 'Resulting stock is too large.');
    await conn.execute('UPDATE inventory SET quantity = ? WHERE organization_id = ? AND batch_id = ?', [after, String(actor.organizationId), batchId]);
    await audit.record(conn, actor, { action: 'STOCK_ADJUSTED', entityType: 'BATCH', entityId: batchId, details: { before, after, delta, reason } });
    return { before, after };
  });
}

module.exports = { stockStatus, list, summary, lookup, adjust, BATCH_COLS, batchFields };
