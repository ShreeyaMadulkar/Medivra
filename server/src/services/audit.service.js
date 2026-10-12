'use strict';
const { z } = require('zod');
const pool = require('../db/pool');
const { parseQuery, pageQuery, limitClause, pagination } = require('../utils/http');

/**
 * Writes one audit row. Pass the transaction connection so the log commits or rolls back together
 * with the change it describes. `details` must never contain passwords, tokens, keys or plaintext notes.
 */
async function record(db, actor, { action, entityType, entityId = null, details = null, organizationId }) {
  await db.execute(
    `INSERT INTO audit_logs (actor_user_id, actor_role, organization_id, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor.userId == null ? null : String(actor.userId),
      actor.role ?? null,
      organizationId === undefined ? (actor.organizationId == null ? null : String(actor.organizationId)) : organizationId,
      action,
      entityType,
      entityId == null ? null : String(entityId),
      details ? JSON.stringify(details) : null,
      actor.ip ? String(actor.ip).slice(0, 45) : null,
    ],
  );
}

const listQuery = z.object({
  ...pageQuery,
  action: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(30).optional(),
  organizationId: z.string().regex(/^\d+$/).optional(),
  userId: z.string().regex(/^\d+$/).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

/** ADMIN: platform-wide (optional filters). Others: forced to their own organization. */
async function list(user, rawQuery) {
  const q = parseQuery(listQuery, rawQuery);
  const where = [];
  const params = [];
  if (user.role === 'ADMIN') {
    if (q.organizationId) { where.push('a.organization_id = ?'); params.push(q.organizationId); }
  } else {
    where.push('a.organization_id = ?');
    params.push(String(user.organizationId));
  }
  if (q.action) { where.push('a.action = ?'); params.push(q.action); }
  if (q.entityType) { where.push('a.entity_type = ?'); params.push(q.entityType); }
  if (q.userId) { where.push('a.actor_user_id = ?'); params.push(q.userId); }
  if (q.from) { where.push('a.created_at >= ?'); params.push(`${q.from} 00:00:00.000`); }
  if (q.to) { where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${q.to} 00:00:00.000`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM audit_logs a ${w}`, params);
  const [rows] = await pool.execute(
    `SELECT a.id, a.actor_user_id, a.actor_role, a.organization_id, a.action, a.entity_type, a.entity_id, a.details,
            a.ip_address, a.created_at, u.name AS actor_name, o.name AS organization_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN organizations o ON o.id = a.organization_id
       ${w} ORDER BY a.id DESC ${limitClause(q)}`,
    params,
  );
  return {
    auditLogs: rows.map((r) => ({
      id: String(r.id),
      at: new Date(r.created_at).toISOString(),
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id == null ? null : String(r.entity_id),
      actorId: r.actor_user_id == null ? null : String(r.actor_user_id),
      actor: r.actor_name || null,
      actorRole: r.actor_role,
      organizationId: r.organization_id == null ? null : String(r.organization_id),
      organization: r.organization_name || null,
      details: r.details ?? null,
      ip: user.role === 'ADMIN' ? r.ip_address : undefined,
    })),
    pagination: pagination(q, Number(total)),
  };
}

module.exports = { record, list };
