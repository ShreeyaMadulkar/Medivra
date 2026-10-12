'use strict';
/**
 * Phase 1 tests. Run with `npm test` (needs MySQL running and DB_* in server/.env).
 * They use a SEPARATE database (TEST_DB_NAME, default medivra_test) which is created if missing,
 * so your real `medivra` data is never touched. Only rows created by these tests are removed.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // DB credentials from your real .env (read-only)

const TEST_DB = process.env.TEST_DB_NAME || 'medivra_test';
if (TEST_DB === (process.env.DB_NAME || 'medivra')) throw new Error('TEST_DB_NAME must differ from DB_NAME.');
process.env.DB_NAME = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : 'test-only-secret-test-only-secret-1234';
process.env.LOCKOUT_SECONDS = '2';           // short so the "unlock after expiry" test is quick
process.env.MAX_FAILED_LOGINS = '3';
process.env.LOGIN_RATE_LIMIT_MAX = '80';
process.env.REGISTER_RATE_LIMIT_MAX = '500';
process.env.REGISTRATION_REQUIRES_APPROVAL = 'false';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const config = require('../src/config/env');
const { applySchema } = require('../scripts/init-db');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { createPasswordRecord, verifyPassword, hashPassword } = require('../src/utils/password');

const DOMAIN = '@test.medivra.invalid';
const PW = 'Medivra@123';
let base;
let server;

const api = async (method, url, body, token) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
};

let n = 0;
const reg = (over = {}) => ({
  name: 'Test User',
  email: `user${++n}-${Date.now()}${DOMAIN}`,
  phone: '+91 98765 43210',
  organization: `TestOrg ${n} ${Date.now()}`,
  role: 'PHARMACY',
  password: PW,
  ...over,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup() {
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  await pool.execute("DELETE FROM organizations WHERE name LIKE 'TestOrg%'");
}

before(async () => {
  const admin = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  await applySchema(TEST_DB);
  await cleanup();
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await pool.end();
});

/* 1 */
test('1. registration then login succeeds and /me works', async () => {
  const body = reg();
  const r = await api('POST', '/api/auth/register', body);
  assert.equal(r.status, 201);
  assert.equal(r.json.user.email, body.email);
  assert.equal(r.json.user.role, 'PHARMACY');
  assert.equal(r.json.user.status, 'Active');

  const l = await api('POST', '/api/auth/login', { email: body.email, password: PW, role: 'PHARMACY' });
  assert.equal(l.status, 200);
  assert.ok(l.json.token);
  assert.equal(l.json.user.organization, body.organization);

  const me = await api('GET', '/api/auth/me', undefined, l.json.token);
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, body.email);
  const claims = jwt.decode(l.json.token);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'org', 'role', 'sub']);
});

test('1b. email is normalised (trimmed, lowercased) and login is case-insensitive', async () => {
  const body = reg();
  const r = await api('POST', '/api/auth/register', { ...body, email: `  ${body.email.toUpperCase()}  ` });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.email, body.email);
  const l = await api('POST', '/api/auth/login', { email: body.email.toUpperCase(), password: PW });
  assert.equal(l.status, 200);
});

/* 2 + 3 */
test('2/3. stored hash is salted SHA-512; salts differ between users', async () => {
  const a = reg();
  const b = reg();
  await api('POST', '/api/auth/register', a);
  await api('POST', '/api/auth/register', b); // same password on purpose
  const [rows] = await pool.execute('SELECT email, password_hash, password_salt FROM users WHERE email IN (?, ?)', [a.email, b.email]);
  assert.equal(rows.length, 2);
  const [x, y] = rows;
  assert.notEqual(x.password_salt, y.password_salt);
  assert.notEqual(x.password_hash, y.password_hash); // same password, different salt => different hash
  for (const row of rows) {
    assert.match(row.password_salt, /^[0-9a-f]{64}$/);
    assert.match(row.password_hash, /^[0-9a-f]{128}$/);
    const expected = crypto.createHash('sha512').update(Buffer.from(row.password_salt, 'hex')).update(Buffer.from(PW, 'utf8')).digest('hex');
    assert.equal(row.password_hash, expected);
    assert.ok(!row.password_hash.includes(PW));
    assert.equal(verifyPassword(PW, row.password_salt, row.password_hash), true);
    assert.equal(verifyPassword(PW + 'x', row.password_salt, row.password_hash), false);
  }
  const rec = createPasswordRecord(PW);
  assert.equal(rec.hash, hashPassword(PW, rec.salt));
});

/* 4 */
test('4. wrong password is rejected with a generic error', async () => {
  const body = reg();
  await api('POST', '/api/auth/register', body);
  const bad = await api('POST', '/api/auth/login', { email: body.email, password: 'Wrong@123' });
  const ghost = await api('POST', '/api/auth/login', { email: `nobody${Date.now()}${DOMAIN}`, password: 'Wrong@123' });
  assert.equal(bad.status, 401);
  assert.equal(ghost.status, 401);
  assert.deepEqual(bad.json, ghost.json); // identical => no account enumeration
});

test('4b. selecting the wrong role fails like a wrong password', async () => {
  const body = reg();
  await api('POST', '/api/auth/register', body);
  const r = await api('POST', '/api/auth/login', { email: body.email, password: PW, role: 'ADMIN' });
  assert.equal(r.status, 401);
});

/* 5 */
test('5. duplicate email is rejected (409), even with different letter case', async () => {
  const body = reg();
  assert.equal((await api('POST', '/api/auth/register', body)).status, 201);
  const dup = await api('POST', '/api/auth/register', { ...reg(), email: body.email.toUpperCase() });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'EMAIL_EXISTS');
});

test('5b. registering into an existing organization is refused (409) and leaves no orphan user', async () => {
  const first = reg();
  await api('POST', '/api/auth/register', first);
  const second = reg({ organization: first.organization.toUpperCase(), role: first.role });
  const r = await api('POST', '/api/auth/register', second);
  assert.equal(r.status, 409);
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [second.email]);
  assert.equal(rows.length, 0);
});

/* 6 */
test('6. public registration cannot create ADMIN users', async () => {
  for (const extra of [{ role: 'ADMIN' }, { role: 'admin' }, { isAdmin: true }, { status: 'ACTIVE' }, { organizationId: 1 }]) {
    const body = { ...reg(), ...extra };
    const r = await api('POST', '/api/auth/register', body);
    assert.equal(r.status, 400, JSON.stringify(extra));
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [body.email]);
    assert.equal(rows.length, 0);
  }
  const [admins] = await pool.execute("SELECT id FROM users WHERE role='ADMIN' AND email LIKE ?", [`%${DOMAIN}`]);
  assert.equal(admins.length, 0);
});

test('6b. database constraints block an ADMIN with an organization, and a role/org-type mismatch', async () => {
  const org = reg();
  await api('POST', '/api/auth/register', org);
  const [[o]] = await pool.execute('SELECT id FROM organizations WHERE name = ?', [org.organization]);
  const ins = (orgId, orgType, role) =>
    pool.execute(
      'INSERT INTO users (organization_id, org_type, name, email, role, password_hash, password_salt) VALUES (?,?,?,?,?,?,?)',
      [orgId, orgType, 'X', `c${Date.now()}${Math.random()}${DOMAIN}`, role, 'a'.repeat(128), crypto.randomBytes(32).toString('hex')],
    );
  await assert.rejects(ins(o.id, 'PHARMACY', 'ADMIN'));
  await assert.rejects(ins(o.id, 'PHARMACY', 'DISTRIBUTOR'));
  await assert.rejects(ins(null, null, 'PHARMACY'));
});

test('6c. weak passwords and bad fields are rejected by Zod', async () => {
  const r = await api('POST', '/api/auth/register', reg({ password: 'weak', email: 'not-an-email', phone: 'abc', name: '' }));
  assert.equal(r.status, 400);
  assert.ok(r.json.error.details.password && r.json.error.details.email && r.json.error.details.phone && r.json.error.details.name);
});

/* 7 + 8 */
test('7/8. locks after 3 failed attempts for 30s (2s in tests), then login works again', async () => {
  const body = reg();
  await api('POST', '/api/auth/register', body);
  const bad = () => api('POST', '/api/auth/login', { email: body.email, password: 'Wrong@123' });

  assert.equal((await bad()).status, 401);
  assert.equal((await bad()).status, 401);
  const third = await bad();
  assert.equal(third.status, 429);
  assert.equal(third.json.error.code, 'ACCOUNT_LOCKED');
  assert.ok(third.json.error.retryAfterSeconds >= 1 && third.json.error.retryAfterSeconds <= config.lockout.seconds);

  // Correct password while locked is still refused and does not unlock early.
  const during = await api('POST', '/api/auth/login', { email: body.email, password: PW });
  assert.equal(during.status, 429);
  assert.equal(during.json.token, undefined);

  await sleep(2300);
  const after = await api('POST', '/api/auth/login', { email: body.email, password: PW });
  assert.equal(after.status, 200);
  const [[row]] = await pool.execute('SELECT failed_login_count, locked_until FROM users WHERE email = ?', [body.email]);
  assert.equal(row.failed_login_count, 0);
  assert.equal(row.locked_until, null);
});

test('8b. after expiry the counter restarts (fresh 3 attempts) and success resets it', async () => {
  const body = reg();
  await api('POST', '/api/auth/register', body);
  const bad = () => api('POST', '/api/auth/login', { email: body.email, password: 'Wrong@123' });
  await bad(); await bad();
  assert.equal((await api('POST', '/api/auth/login', { email: body.email, password: PW })).status, 200); // success resets count
  assert.equal((await bad()).status, 401);
  assert.equal((await bad()).status, 401); // would be the 3rd/4th without reset
  assert.equal((await bad()).status, 429);
  await sleep(2300);
  assert.equal((await bad()).status, 401); // first failure of a new window, not an instant re-lock
});

test('8c. unknown emails follow the same 401,401,429 sequence (no account enumeration)', async () => {
  const email = `ghost${Date.now()}${DOMAIN}`;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await api('POST', '/api/auth/login', { email, password: 'Wrong@123' })).status);
  assert.deepEqual(codes, [401, 401, 429]);
});

test('8d. concurrent failed attempts cannot bypass the counter', async () => {
  const body = reg();
  await api('POST', '/api/auth/register', body);
  const results = await Promise.all(Array.from({ length: 10 }, () => api('POST', '/api/auth/login', { email: body.email, password: 'Wrong@123' })));
  const [[row]] = await pool.execute('SELECT failed_login_count, locked_until FROM users WHERE email = ?', [body.email]);
  assert.equal(results.filter((r) => r.status === 401).length, 2);
  assert.equal(results.filter((r) => r.status === 429).length, 8);
  assert.equal(row.failed_login_count, 3);
  assert.ok(row.locked_until);
});

/* 9 */
test('9. missing, invalid, tampered, expired and forged tokens are rejected', async () => {
  const body = reg();
  const r = await api('POST', '/api/auth/register', body);
  const id = r.json.user.id;
  const good = (await api('POST', '/api/auth/login', { email: body.email, password: PW })).json.token;

  assert.equal((await api('GET', '/api/auth/me')).status, 401);
  assert.equal((await api('GET', '/api/auth/me', undefined, 'garbage.token.value')).status, 401);
  const parts = good.split('.');
  const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: id, role: 'ADMIN', org: null, exp: 9999999999 })).toString('base64url')}.${parts[2]}`;
  assert.equal((await api('GET', '/api/auth/me', undefined, tampered)).status, 401);

  const opts = { subject: id, issuer: config.jwt.issuer, audience: config.jwt.audience };
  const expired = jwt.sign({ role: 'PHARMACY', org: null }, config.jwt.secret, { ...opts, expiresIn: -60 });
  assert.equal((await api('GET', '/api/auth/me', undefined, expired)).status, 401);
  const wrongSecret = jwt.sign({ role: 'PHARMACY', org: null }, 'x'.repeat(40), { ...opts, expiresIn: 60 });
  assert.equal((await api('GET', '/api/auth/me', undefined, wrongSecret)).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 9999999999 })).toString('base64url')}.`;
  assert.equal((await api('GET', '/api/auth/me', undefined, none)).status, 401);
  const wrongAud = jwt.sign({ role: 'PHARMACY' }, config.jwt.secret, { subject: id, issuer: config.jwt.issuer, audience: 'other', expiresIn: 60 });
  assert.equal((await api('GET', '/api/auth/me', undefined, wrongAud)).status, 401);
});

test('9b. role/org claims are not authoritative: DB role wins, deactivated users are refused', async () => {
  const body = reg();
  const r = await api('POST', '/api/auth/register', body);
  const forged = jwt.sign({ role: 'ADMIN', org: '999999' }, config.jwt.secret, {
    subject: r.json.user.id, issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: 60,
  });
  const me = await api('GET', '/api/auth/me', undefined, forged);
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, 'PHARMACY');
  assert.equal(me.json.user.organizationId, r.json.user.organizationId);

  await pool.execute("UPDATE users SET status='INACTIVE' WHERE email = ?", [body.email]);
  assert.equal((await api('GET', '/api/auth/me', undefined, forged)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: body.email, password: PW })).status, 403);
});

/* 10 */
test('10. responses never contain password hashes, salts or password fields', async () => {
  const body = reg();
  const r = await api('POST', '/api/auth/register', body);
  const l = await api('POST', '/api/auth/login', { email: body.email, password: PW });
  const me = await api('GET', '/api/auth/me', undefined, l.json.token);
  const wrong = await api('POST', '/api/auth/login', { email: body.email, password: 'Wrong@123' });
  const [[row]] = await pool.execute('SELECT password_hash, password_salt FROM users WHERE email = ?', [body.email]);
  for (const res of [r, l, me, wrong]) {
    assert.ok(!res.text.includes(row.password_hash));
    assert.ok(!res.text.includes(row.password_salt));
    assert.ok(!/password|salt|hash/i.test(Object.keys(res.json.user || {}).join(',')));
  }
  assert.ok(!r.text.includes(PW) && !l.text.includes(PW));
});

/* 11 */
test('11. SQL injection attempts are handled safely', async () => {
  const victim = reg();
  await api('POST', '/api/auth/register', victim);
  const payloads = [`' OR '1'='1' --`, `${victim.email}' --`, `x' OR 1=1 #`, `"; DROP TABLE users; --`];
  for (const p of payloads) {
    const a = await api('POST', '/api/auth/login', { email: p, password: p });
    assert.equal(a.status, 401, p);
    assert.equal(a.json.token, undefined);
  }
  // Injection through the password field of a real account must not bypass the check.
  const b = await api('POST', '/api/auth/login', { email: victim.email, password: `' OR '1'='1` });
  assert.equal(b.status, 401);

  // Registration: bad email shape is rejected, hostile organization name is stored as plain text.
  assert.equal((await api('POST', '/api/auth/register', reg({ email: `a'; DROP TABLE users;--@x.com` }))).status, 400);
  const evilOrg = `TestOrg'); DROP TABLE users;--`;
  const evil = reg({ organization: evilOrg });
  assert.equal((await api('POST', '/api/auth/register', evil)).status, 201);
  const [[o]] = await pool.execute('SELECT name FROM organizations WHERE name = ?', [evilOrg]);
  assert.equal(o.name, evilOrg);
  const [t] = await pool.query("SHOW TABLES LIKE 'users'");
  assert.equal(t.length, 1);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM users');
  assert.ok(c >= 1);

  // Malformed JSON / wrong types
  assert.equal((await api('POST', '/api/auth/login', '{bad json')).status, 400);
  assert.equal((await api('POST', '/api/auth/login', { email: { $ne: '' }, password: ['a'] })).status, 400);
});

test('12. security headers present and unknown routes return a safe 404', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('x-content-type-options'));
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal((await api('GET', '/api/nope')).status, 404);
});

test('13. login requests are rate limited (runs last)', async () => {
  let limited = 0;
  for (let i = 0; i < 100 && !limited; i++) {
    const r = await api('POST', '/api/auth/login', { email: `rl${i}${DOMAIN}`, password: 'Wrong@123' });
    if (r.status === 429 && r.json.error.code === 'RATE_LIMITED') limited = i + 1;
  }
  assert.ok(limited > 0, 'expected a RATE_LIMITED response');
});
