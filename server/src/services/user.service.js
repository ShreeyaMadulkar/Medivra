'use strict';
const pool = require('../db/pool');

const STATUS_LABEL = { ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Locked' };

/**
 * Safe public representation (matches the frontend `User` type).
 * Never includes password_hash, password_salt or lockout internals.
 */
function toPublicUser(row) {
  const lockedNow = row.locked_until && new Date(row.locked_until).getTime() > Date.now();
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    organization: row.organization_name || (row.role === 'ADMIN' ? 'Medivra Systems' : ''),
    organizationId: row.organization_id == null ? '' : String(row.organization_id),
    role: row.role,
    status: lockedNow ? 'Locked' : STATUS_LABEL[row.status] || 'Inactive',
    lastLogin: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  };
}

const USER_SELECT = `
  SELECT u.id, u.organization_id, u.name, u.email, u.phone, u.role, u.status, u.locked_until, u.last_login_at,
         o.name AS organization_name, o.type AS organization_type, o.status AS organization_status
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id`;

/**
 * Reloads the CURRENT user, role and organization from the database.
 * Use this (via the `authenticate` middleware) for authorization decisions - never trust role/org claims in a JWT.
 * Returns null if the user does not exist, is not ACTIVE, or (for non-admins) their organization is not ACTIVE.
 */
async function loadActiveUser(userId, db = pool) {
  if (!/^\d+$/.test(String(userId))) return null;
  const [rows] = await db.execute(`${USER_SELECT} WHERE u.id = ? LIMIT 1`, [String(userId)]);
  const row = rows[0];
  if (!row || row.status !== 'ACTIVE') return null;
  if (row.role !== 'ADMIN' && row.organization_status !== 'ACTIVE') return null;
  return {
    id: row.id,
    role: row.role,
    organizationId: row.organization_id,
    organizationType: row.organization_type || null,
    publicUser: toPublicUser(row),
  };
}

module.exports = { toPublicUser, loadActiveUser, USER_SELECT };
