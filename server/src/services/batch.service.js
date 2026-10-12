'use strict';
const { z } = require('zod');
const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { parseQuery, pageQuery, limitClause, pagination, likeTerm, todayUtc } = require('../utils/http');
const { stockStatus, batchFields, BATCH_COLS } = require('./inventory.service');
const audit = require('./audit.service');

const dupBatch = () => new HttpError(409, 'BATCH_EXISTS', 'This batch (same manufacturer, medicine and batch number) is already registered.');

/**
 * Visibility: ADMIN sees all (read-only). DISTRIBUTOR/PHARMACY see batches their organization registered
 * or currently holds stock of. The organization comes from the authenticated user, never from the request.
 */
function visibility(user) {
  if (user.role === 'ADMIN') return { sql: '1=1', params: [], qtySql: '(SELECT COALESCE(SUM(x.quantity),0) FROM inventory x WHERE x.batch_id = b.id)', qtyParams: [] };
  const org = String(user.organizationId);
  return {
    sql: '(b.origin_org_id = ? OR EXISTS (SELECT 1 FROM inventory v WHERE v.batch_id = b.id AND v.organization_id = ?))',
    params: [org, org],
    qtySql: '(SELECT COALESCE(SUM(x.quantity),0) FROM inventory x WHERE x.batch_id = b.id AND x.organization_id = ?)',
    qtyParams: [org],
  };
}

const dto = (r) => ({
  ...batchFields(r),
  id: String(r.batch_id),
  quantity: Number(r.quantity), // admin: platform total, others: own available stock
  status: stockStatus(Number(r.quantity), r.expiry_date),
  createdAt: new Date(r.batch_created_at).toISOString(),
  updatedAt: new Date(r.batch_updated_at).toISOString(),
});

const SELECT = (qtySql) => `SELECT ${BATCH_COLS}, ${qtySql} AS quantity
  FROM batches b JOIN organizations oo ON oo.id = b.origin_org_id`;

const listQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  category: z.enum(['Analgesic', 'Antibiotic', 'Antihistamine', 'Antidiabetic', 'Other']).optional(),
  expired: z.enum(['true', 'false']).optional(),
});

async function list(user, rawQuery) {
  const q = parseQuery(listQuery, rawQuery);
  const v = visibility(user);
  const where = [v.sql];
  const params = [...v.params];
  if (q.q) { where.push('(b.medicine_name LIKE ? OR b.batch_number LIKE ? OR b.manufacturer LIKE ?)'); params.push(likeTerm(q.q), likeTerm(q.q), likeTerm(q.q)); }
  if (q.category) { where.push('b.category = ?'); params.push(q.category); }
  if (q.expired === 'true') where.push('b.expiry_date <= CURDATE()');
  if (q.expired === 'false') where.push('b.expiry_date > CURDATE()');
  const w = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM batches b ${w}`, params);
  const [rows] = await pool.execute(
    `${SELECT(v.qtySql)} ${w} ORDER BY b.id DESC ${limitClause(q)}`,
    [...v.qtyParams, ...params],
  );
  return { batches: rows.map(dto), pagination: pagination(q, Number(total)) };
}

async function getOne(user, id) {
  const v = visibility(user);
  const [rows] = await pool.execute(`${SELECT(v.qtySql)} WHERE b.id = ? AND ${v.sql}`, [...v.qtyParams, id, ...v.params]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Batch not found.'); // same answer whether it does not exist or is not yours
  return { batch: dto(rows[0]) };
}

async function create(actor, b) {
  const orgId = String(actor.organizationId);
  const id = await withTransaction(async (conn) => {
    let batchId;
    try {
      const [r] = await conn.execute(
        `INSERT INTO batches (origin_org_id, batch_number, medicine_name, category, manufacturer, manufacture_date, expiry_date,
                              original_quantity, unit_price, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, b.batchNumber, b.medicineName, b.category, b.manufacturer, b.manufactureDate, b.expiryDate, b.quantity, b.unitPrice, b.notes || null, String(actor.userId)],
      );
      batchId = r.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw dupBatch();
      throw e;
    }
    await conn.execute('INSERT INTO inventory (organization_id, batch_id, quantity) VALUES (?, ?, ?)', [orgId, String(batchId), b.quantity]);
    await audit.record(conn, actor, {
      action: 'BATCH_CREATED', entityType: 'BATCH', entityId: batchId,
      details: { batchNumber: b.batchNumber, medicineName: b.medicineName, manufacturer: b.manufacturer, expiryDate: b.expiryDate, quantity: b.quantity },
    });
    await audit.record(conn, actor, {
      action: 'STOCK_ADDED', entityType: 'BATCH', entityId: batchId, details: { before: 0, after: b.quantity, reason: 'Initial stock on batch registration' },
    });
    return String(batchId);
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

const IDENTITY = ['batchNumber', 'medicineName', 'manufacturer', 'manufactureDate', 'expiryDate'];
const COLUMN = {
  batchNumber: 'batch_number', medicineName: 'medicine_name', manufacturer: 'manufacturer', manufactureDate: 'manufacture_date',
  expiryDate: 'expiry_date', category: 'category', unitPrice: 'unit_price', notes: 'notes',
};

/**
 * Only the registering distributor may edit. Identity fields (batch number, medicine, manufacturer, dates) are
 * locked once any transfer references the batch, so traceability can never be rewritten after the fact.
 * Quantity is NOT editable here - use POST /api/inventory/:batchId/adjust (audited).
 */
async function update(actor, id, patch) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT batch_number, medicine_name, manufacturer, category, unit_price, notes,
              DATE_FORMAT(manufacture_date, '%Y-%m-%d') AS manufacture_date, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date
         FROM batches WHERE id = ? AND origin_org_id = ? FOR UPDATE`,
      [id, String(actor.organizationId)],
    );
    const cur = rows[0];
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Batch not found.');
    const curCamel = {
      batchNumber: cur.batch_number, medicineName: cur.medicine_name, manufacturer: cur.manufacturer,
      manufactureDate: cur.manufacture_date, expiryDate: cur.expiry_date, category: cur.category,
      unitPrice: Number(cur.unit_price), notes: cur.notes,
    };
    const changed = Object.keys(patch).filter((k) => patch[k] !== undefined && patch[k] !== curCamel[k] && !(k === 'notes' && !patch[k] && !curCamel[k]));
    if (!changed.length) return;

    if (changed.some((k) => IDENTITY.includes(k))) {
      const [used] = await conn.execute('SELECT 1 FROM transfer_items WHERE batch_id = ? LIMIT 1', [id]);
      if (used.length) {
        throw new HttpError(409, 'BATCH_LOCKED', 'This batch is part of a transfer; only category, unit price and notes can be edited.');
      }
    }
    const mfg = patch.manufactureDate ?? cur.manufacture_date;
    const exp = patch.expiryDate ?? cur.expiry_date;
    if (exp <= mfg) throw new HttpError(400, 'VALIDATION_ERROR', 'Expiry date must be after the manufacture date.', { details: { expiryDate: 'Expiry date must be after the manufacture date.' } });
    if (mfg > todayUtc()) throw new HttpError(400, 'VALIDATION_ERROR', 'Manufacture date cannot be in the future.', { details: { manufactureDate: 'Manufacture date cannot be in the future.' } });

    const sets = changed.map((k) => `${COLUMN[k]} = ?`);
    const params = changed.map((k) => (k === 'notes' ? patch.notes || null : patch[k]));
    try {
      await conn.execute(`UPDATE batches SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw dupBatch();
      throw e;
    }
    const diff = {};
    for (const k of changed) diff[k] = k === 'notes' ? 'changed' : { from: curCamel[k], to: patch[k] };
    await audit.record(conn, actor, { action: 'BATCH_UPDATED', entityType: 'BATCH', entityId: id, details: diff });
  });
  return getOne({ role: actor.role, organizationId: actor.organizationId }, id);
}

module.exports = { list, getOne, create, update };
