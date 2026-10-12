'use strict';
const { z } = require('zod');
const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { createPasswordRecord } = require('../utils/password');
const { withTransaction } = require('../utils/transaction');
const { parseQuery, pageQuery, limitClause, pagination, likeTerm } = require('../utils/http');
const { toPublicUser, USER_SELECT } = require('./user.service');
const audit = require('./audit.service');

/* ------------------------------------------------------------------ organizations */

const orgDto = (r) => ({
  id: String(r.id),
  name: r.name,
  type: r.type,
  status: r.status === 'ACTIVE' ? 'Active' : 'Inactive',
  userCount: r.user_count == null ? undefined : Number(r.user_count),
  createdAt: new Date(r.created_at).toISOString(),
});
const ORG_SELECT = `SELECT o.id, o.name, o.type, o.status, o.created_at,
    (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count FROM organizations o`;

const orgListQuery = z.object({
  ...pageQuery,
  type: z.enum(['DISTRIBUTOR', 'PHARMACY']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  q: z.string().trim().max(100).optional(),
});

async function listOrganizations(rawQuery) {
  const q = parseQuery(orgListQuery, rawQuery);
  const where = [];
  const params = [];
  if (q.type) { where.push('o.type = ?'); params.push(q.type); }
  if (q.status) { where.push('o.status = ?'); params.push(q.status); }
  if (q.q) { where.push('o.name LIKE ?'); params.push(likeTerm(q.q)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM organizations o ${w}`, params);
  const [rows] = await pool.execute(`${ORG_SELECT} ${w} ORDER BY o.id DESC ${limitClause(q)}`, params);
  return { organizations: rows.map(orgDto), pagination: pagination(q, Number(total)) };
}

/** Distributors need to pick a destination: active PHARMACY organizations, id + name only. */
async function listPharmacyDirectory(rawQuery) {
  const q = parseQuery(z.object({ ...pageQuery, q: z.string().trim().max(100).optional() }), rawQuery);
  const params = [];
  let w = "WHERE o.type = 'PHARMACY' AND o.status = 'ACTIVE'";
  if (q.q) { w += ' AND o.name LIKE ?'; params.push(likeTerm(q.q)); }
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM organizations o ${w}`, params);
  const [rows] = await pool.execute(`SELECT o.id, o.name FROM organizations o ${w} ORDER BY o.name ${limitClause(q)}`, params);
  return { organizations: rows.map((r) => ({ id: String(r.id), name: r.name, type: 'PHARMACY' })), pagination: pagination(q, Number(total)) };
}

async function getOrganization(id) {
  const [rows] = await pool.execute(`${ORG_SELECT} WHERE o.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Organization not found.');
  return { organization: orgDto(rows[0]) };
}

async function createOrganization(actor, { name, type }) {
  return withTransaction(async (conn) => {
    let id;
    try {
      const [r] = await conn.execute('INSERT INTO organizations (name, type) VALUES (?, ?)', [name, type]);
      id = r.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'ORGANIZATION_EXISTS', 'An organization with this name and type already exists.');
      throw e;
    }
    await audit.record(conn, actor, { action: 'ORGANIZATION_CREATED', entityType: 'ORGANIZATION', entityId: id, details: { name, type }, organizationId: null });
    const [rows] = await conn.execute(`${ORG_SELECT} WHERE o.id = ?`, [String(id)]);
    return { organization: orgDto(rows[0]) };
  });
}

async function updateOrganization(actor, id, patch) {
  return withTransaction(async (conn) => {
    const [cur] = await conn.execute('SELECT id, name, status FROM organizations WHERE id = ? FOR UPDATE', [id]);
    if (!cur[0]) throw new HttpError(404, 'NOT_FOUND', 'Organization not found.');
    const sets = [];
    const params = [];
    const changes = {};
    if (patch.name !== undefined && patch.name !== cur[0].name) { sets.push('name = ?'); params.push(patch.name); changes.name = { from: cur[0].name, to: patch.name }; }
    if (patch.status !== undefined && patch.status !== cur[0].status) { sets.push('status = ?'); params.push(patch.status); changes.status = { from: cur[0].status, to: patch.status }; }
    if (sets.length) {
      try {
        await conn.execute(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'ORGANIZATION_EXISTS', 'An organization with this name and type already exists.');
        throw e;
      }
      await audit.record(conn, actor, {
        action: changes.status ? 'ORGANIZATION_STATUS_CHANGED' : 'ORGANIZATION_UPDATED',
        entityType: 'ORGANIZATION', entityId: id, details: changes, organizationId: null,
      });
    }
    const [rows] = await conn.execute(`${ORG_SELECT} WHERE o.id = ?`, [id]);
    return { organization: orgDto(rows[0]) };
  });
}

/* ------------------------------------------------------------------ users */

const userListQuery = z.object({
  ...pageQuery,
  role: z.enum(['ADMIN', 'DISTRIBUTOR', 'PHARMACY']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  organizationId: z.string().regex(/^\d+$/).optional(),
  q: z.string().trim().max(100).optional(),
});

async function listUsers(rawQuery) {
  const q = parseQuery(userListQuery, rawQuery);
  const where = [];
  const params = [];
  if (q.role) { where.push('u.role = ?'); params.push(q.role); }
  if (q.status) { where.push('u.status = ?'); params.push(q.status); }
  if (q.organizationId) { where.push('u.organization_id = ?'); params.push(q.organizationId); }
  if (q.q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(likeTerm(q.q), likeTerm(q.q)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM users u ${w}`, params);
  const [rows] = await pool.execute(`${USER_SELECT} ${w} ORDER BY u.id DESC ${limitClause(q)}`, params);
  return { users: rows.map(toPublicUser), pagination: pagination(q, Number(total)) };
}

async function getUser(id) {
  const [rows] = await pool.execute(`${USER_SELECT} WHERE u.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  return { user: toPublicUser(rows[0]) };
}

async function createUser(actor, body) {
  const { salt, hash } = createPasswordRecord(body.password);
  return withTransaction(async (conn) => {
    let orgId = null;
    let orgType = null;
    if (body.role !== 'ADMIN') {
      const [o] = await conn.execute('SELECT id, type, status FROM organizations WHERE id = ? FOR UPDATE', [body.organizationId]);
      if (!o[0]) throw new HttpError(404, 'NOT_FOUND', 'Organization not found.');
      if (o[0].type !== body.role) throw new HttpError(400, 'VALIDATION_ERROR', 'Role must match the organization type.', { details: { role: 'Role must match the organization type.' } });
      orgId = o[0].id;
      orgType = o[0].type;
    }
    let id;
    try {
      const [r] = await conn.execute(
        `INSERT INTO users (organization_id, org_type, name, email, phone, role, password_hash, password_salt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [orgId, orgType, body.name, body.email, body.phone, body.role, hash, salt],
      );
      id = r.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
      throw e;
    }
    await audit.record(conn, actor, {
      action: 'USER_CREATED', entityType: 'USER', entityId: id,
      details: { email: body.email, role: body.role, organizationId: orgId == null ? null : String(orgId) }, organizationId: orgId == null ? null : String(orgId),
    });
    const [rows] = await conn.execute(`${USER_SELECT} WHERE u.id = ?`, [String(id)]);
    return { user: toPublicUser(rows[0]) };
  });
}

async function updateUser(actor, id, patch) {
  if (patch.status !== undefined && patch.status !== 'ACTIVE' && String(actor.userId) === String(id)) {
    throw new HttpError(409, 'CANNOT_MODIFY_SELF', 'You cannot deactivate or suspend your own account.');
  }
  return withTransaction(async (conn) => {
    const [cur] = await conn.execute('SELECT id, name, phone, status, organization_id FROM users WHERE id = ? FOR UPDATE', [id]);
    if (!cur[0]) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
    const sets = [];
    const params = [];
    const changes = {};
    if (patch.name !== undefined && patch.name !== cur[0].name) { sets.push('name = ?'); params.push(patch.name); changes.name = true; }
    if (patch.phone !== undefined && patch.phone !== cur[0].phone) { sets.push('phone = ?'); params.push(patch.phone); changes.phone = true; }
    if (patch.status !== undefined && patch.status !== cur[0].status) {
      sets.push('status = ?'); params.push(patch.status);
      if (patch.status === 'ACTIVE') sets.push('failed_login_count = 0', 'locked_until = NULL'); // re-activating also clears a lockout
      changes.status = { from: cur[0].status, to: patch.status };
    }
    if (sets.length) {
      await conn.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      await audit.record(conn, actor, {
        action: changes.status ? 'USER_STATUS_CHANGED' : 'USER_UPDATED', entityType: 'USER', entityId: id,
        details: changes, organizationId: cur[0].organization_id == null ? null : String(cur[0].organization_id),
      });
    }
    const [rows] = await conn.execute(`${USER_SELECT} WHERE u.id = ?`, [id]);
    return { user: toPublicUser(rows[0]) };
  });
}

/* ------------------------------------------------------------------ platform overview */

async function overview() {
  const [[orgs]] = await pool.execute(
    `SELECT SUM(type='DISTRIBUTOR') AS distributors, SUM(type='PHARMACY') AS pharmacies, SUM(status='ACTIVE') AS active, COUNT(*) AS total FROM organizations`);
  const [[users]] = await pool.execute(
    `SELECT COUNT(*) AS total, SUM(status='ACTIVE') AS active, SUM(role='ADMIN') AS admins FROM users`);
  const [[stock]] = await pool.execute(
    `SELECT COUNT(DISTINCT batch_id) AS batches, COALESCE(SUM(quantity),0) AS units FROM inventory`);
  const [tr] = await pool.execute('SELECT status, COUNT(*) AS n FROM transfers GROUP BY status');
  const [[transit]] = await pool.execute(
    `SELECT COALESCE(SUM(i.quantity),0) AS units FROM transfer_items i JOIN transfers t ON t.id = i.transfer_id WHERE t.status = 'IN_TRANSIT'`);
  const transfers = { PENDING: 0, IN_TRANSIT: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const r of tr) transfers[r.status] = Number(r.n);
  const recent = await audit.list({ role: 'ADMIN' }, { limit: '10' });
  return {
    organizations: { total: Number(orgs.total), active: Number(orgs.active || 0), distributors: Number(orgs.distributors || 0), pharmacies: Number(orgs.pharmacies || 0) },
    users: { total: Number(users.total), active: Number(users.active || 0), admins: Number(users.admins || 0) },
    inventory: { distinctBatches: Number(stock.batches), availableUnits: Number(stock.units), inTransitUnits: Number(transit.units) },
    transfers,
    recentActivity: recent.auditLogs,
  };
}

module.exports = {
  listOrganizations, listPharmacyDirectory, getOrganization, createOrganization, updateOrganization,
  listUsers, getUser, createUser, updateUser, overview,
};
