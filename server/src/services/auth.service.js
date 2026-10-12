'use strict';
const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const config = require('../config/env');
const { createPasswordRecord, verifyPassword, burnDummyVerification } = require('../utils/password');
const { signToken } = require('./token.service');
const { toPublicUser, USER_SELECT } = require('./user.service');

const INVALID = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
const lockedError = (seconds) =>
  new HttpError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Your account has been temporarily locked.', {
    retryAfterSeconds: seconds,
    headers: { 'Retry-After': String(seconds) },
  });

/* ------------------------------------------------------------------ registration */

async function register({ name, email, phone, organization, role, password }) {
  const { salt, hash } = createPasswordRecord(password);
  const status = config.registrationRequiresApproval ? 'INACTIVE' : 'ACTIVE';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Public registration always creates a NEW organization of the chosen type. It can never join an
    // existing one (that would let a stranger gain access to another company's stock later).
    let orgId;
    try {
      const [r] = await conn.execute('INSERT INTO organizations (name, type) VALUES (?, ?)', [organization, role]);
      orgId = r.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, 'ORGANIZATION_EXISTS', 'This organization is already registered. Ask your organization administrator to add you.');
      }
      throw err;
    }

    let userId;
    try {
      const [r] = await conn.execute(
        `INSERT INTO users (organization_id, org_type, name, email, phone, role, password_hash, password_salt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, role, name, email, phone, role, hash, salt, status],
      );
      userId = r.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
      throw err;
    }

    const [rows] = await conn.execute(`${USER_SELECT} WHERE u.id = ?`, [userId]);
    await conn.commit();
    return { user: toPublicUser(rows[0]), status };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/* ------------------------------------------------------------------ login + lockout */

/**
 * Unknown emails get an in-memory "ghost" lockout so the response sequence (401, 401, 429 ...)
 * is identical to a real account. This prevents using the lockout to discover which emails exist.
 */
const ghost = new Map(); // email -> { count, until }
function ghostAttempt(email) {
  const now = Date.now();
  if (ghost.size > 5000) for (const [k, v] of ghost) if (v.until && v.until <= now) ghost.delete(k);
  let g = ghost.get(email);
  if (g && g.until && g.until <= now) g = undefined;
  if (g && g.until > now) return Math.ceil((g.until - now) / 1000);
  const count = (g ? g.count : 0) + 1;
  if (count >= config.lockout.maxFailed) {
    ghost.set(email, { count, until: now + config.lockout.seconds * 1000 });
    return config.lockout.seconds;
  }
  ghost.set(email, { count, until: 0 });
  return 0;
}

async function login({ email, password, role }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE serialises concurrent attempts on the same account, so the counter cannot be raced.
    const [rows] = await conn.execute(
      `SELECT u.id, u.organization_id, u.role, u.status, u.password_hash, u.password_salt,
              u.failed_login_count, u.locked_until, TIMESTAMPDIFF(MICROSECOND, NOW(3), u.locked_until) AS lock_us
         FROM users u WHERE u.email = ? LIMIT 1 FOR UPDATE`,
      [email],
    );
    const u = rows[0];

    if (!u) {
      await conn.commit();
      burnDummyVerification(password); // similar timing for unknown emails
      const wait = ghostAttempt(email);
      throw wait ? lockedError(wait) : INVALID();
    }

    // Currently locked: reject without even checking the password (a correct password must not unlock early).
    if (u.locked_until && Number(u.lock_us) > 0) {
      await conn.commit();
      throw lockedError(Math.max(1, Math.ceil(Number(u.lock_us) / 1e6)));
    }

    // Lock expired -> start counting from zero again.
    let failed = u.failed_login_count;
    if (u.locked_until) failed = 0;

    const passwordOk = verifyPassword(password, u.password_salt, u.password_hash);
    const roleOk = !role || role === u.role;

    if (!passwordOk || !roleOk) {
      failed += 1;
      if (failed >= config.lockout.maxFailed) {
        await conn.execute(
          'UPDATE users SET failed_login_count = ?, locked_until = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND) WHERE id = ?',
          [failed, config.lockout.seconds * 1e6, u.id],
        );
        await conn.commit();
        throw lockedError(config.lockout.seconds);
      }
      await conn.execute('UPDATE users SET failed_login_count = ?, locked_until = NULL WHERE id = ?', [failed, u.id]);
      await conn.commit();
      throw INVALID();
    }

    // Correct credentials but the account is not usable (generic message; reveals nothing before the password is right).
    if (u.status !== 'ACTIVE') {
      await conn.execute('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [u.id]);
      await conn.commit();
      throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Please contact an administrator.');
    }

    await conn.execute('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(3) WHERE id = ?', [u.id]);
    const [fresh] = await conn.execute(`${USER_SELECT} WHERE u.id = ?`, [u.id]);
    await conn.commit();

    if (fresh[0].role !== 'ADMIN' && fresh[0].organization_status !== 'ACTIVE') {
      throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Please contact an administrator.');
    }
    ghost.delete(email);
    return { token: signToken({ id: u.id, role: u.role, organizationId: u.organization_id }), user: toPublicUser(fresh[0]) };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { register, login };
