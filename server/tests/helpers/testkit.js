'use strict';
/**
 * Shared test setup. Everything runs against a SEPARATE database (TEST_DB_NAME, default medivra_test),
 * which is created if missing. The real `medivra` database is never touched; only rows created by the
 * tests (names starting "TestOrg", emails ending @test.medivra.invalid) are removed.
 * Must be required BEFORE any src/ module.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const TEST_DB = process.env.TEST_DB_NAME || 'medivra_test';
if (TEST_DB === (process.env.DB_NAME || 'medivra')) throw new Error('TEST_DB_NAME must differ from DB_NAME.');
process.env.DB_NAME = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : 'test-only-secret-test-only-secret-1234';
process.env.AES_SECRET = '4f1c9a7e2b6d8035a91e7c4b0d2f6a8e13579bdf02468ace1357924680bdf13a'; // test-only key, never a real one
process.env.LOGIN_RATE_LIMIT_MAX = '5000';
process.env.REGISTER_RATE_LIMIT_MAX = '5000';
process.env.LOW_STOCK_THRESHOLD = '50';

const { before, after } = require('node:test');
const mysql = require('mysql2/promise');
const config = require('../../src/config/env');
const { applySchema } = require('../../scripts/init-db');
const app = require('../../src/app');
const pool = require('../../src/db/pool');
const { createPasswordRecord } = require('../../src/utils/password');

const DOMAIN = '@test.medivra.invalid';
const PW = 'Medivra@123';
let base;
let server;
let n = 0;
const uniq = () => `${Date.now().toString(36)}${(++n).toString(36)}`;

async function api(method, url, body, token) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

async function cleanup() {
  const [users] = await pool.execute('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const [orgs] = await pool.execute("SELECT id FROM organizations WHERE name LIKE 'TestOrg%'");
  const uids = users.map((u) => String(u.id));
  const oids = orgs.map((o) => String(o.id));
  const ph = (a) => a.map(() => '?').join(',');
  if (uids.length || oids.length) {
    const parts = [];
    const p = [];
    if (uids.length) { parts.push(`actor_user_id IN (${ph(uids)})`); p.push(...uids); }
    if (oids.length) { parts.push(`organization_id IN (${ph(oids)})`); p.push(...oids); }
    await pool.execute(`DELETE FROM audit_logs WHERE ${parts.join(' OR ')}`, p);
  }
  if (oids.length) {
    await pool.execute(`DELETE FROM transfer_items WHERE transfer_id IN (SELECT id FROM transfers WHERE from_org_id IN (${ph(oids)}) OR to_org_id IN (${ph(oids)}))`, [...oids, ...oids]);
    await pool.execute(`DELETE FROM transfers WHERE from_org_id IN (${ph(oids)}) OR to_org_id IN (${ph(oids)})`, [...oids, ...oids]);
    await pool.execute(`DELETE FROM inventory WHERE organization_id IN (${ph(oids)})`, oids);
    await pool.execute(`DELETE FROM batches WHERE origin_org_id IN (${ph(oids)})`, oids);
  }
  await pool.execute('DELETE FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  await pool.execute("DELETE FROM organizations WHERE name LIKE 'TestOrg%'");
}

/** Registers the mocha-style hooks: create DB + schema, clean, start the app on a random port. */
function useServer() {
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
}

async function makeOrg(type, label = type) {
  const [r] = await pool.execute('INSERT INTO organizations (name, type) VALUES (?, ?)', [`TestOrg ${label} ${uniq()}`, type]);
  return String(r.insertId);
}
async function makeUser(role, orgId = null, status = 'ACTIVE') {
  const { salt, hash } = createPasswordRecord(PW);
  const email = `u${uniq()}${DOMAIN}`;
  const [r] = await pool.execute(
    'INSERT INTO users (organization_id, org_type, name, email, phone, role, password_hash, password_salt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [orgId, orgId ? role : null, `Test ${role}`, email, '+91 98765 43210', role, hash, salt, status],
  );
  return { id: String(r.insertId), email };
}
async function loginToken(email) {
  const r = await api('POST', '/api/auth/login', { email, password: PW });
  if (r.status !== 200) throw new Error(`test login failed (${r.status})`);
  return r.json.token;
}
/** An organization + one ACTIVE user + a JWT. role = DISTRIBUTOR | PHARMACY | ADMIN. */
async function makeActor(role, label) {
  const orgId = role === 'ADMIN' ? null : await makeOrg(role, label);
  const u = await makeUser(role, orgId);
  return { role, orgId, userId: u.id, email: u.email, token: await loginToken(u.email) };
}

const plusYears = (y) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); };
const batchBody = (over = {}) => ({
  batchNumber: `B${uniq()}`.toUpperCase(),
  medicineName: 'Paracetamol 500mg',
  category: 'Analgesic',
  manufacturer: 'Acme Pharma',
  manufactureDate: '2025-01-01',
  expiryDate: plusYears(3),
  quantity: 100,
  unitPrice: 2.5,
  ...over,
});
async function makeBatch(dist, over = {}) {
  const r = await api('POST', '/api/batches', batchBody(over), dist.token);
  if (r.status !== 201) throw new Error(`makeBatch failed: ${r.status} ${r.text}`);
  return r.json.batch;
}
async function stock(orgId, batchId) {
  const [rows] = await pool.execute('SELECT quantity FROM inventory WHERE organization_id = ? AND batch_id = ?', [orgId, batchId]);
  return rows[0] ? Number(rows[0].quantity) : null;
}
async function auditCount(where, params) {
  const [[r]] = await pool.execute(`SELECT COUNT(*) AS c FROM audit_logs WHERE ${where}`, params);
  return Number(r.c);
}

module.exports = { api, pool, useServer, makeOrg, makeUser, makeActor, makeBatch, batchBody, stock, auditCount, plusYears, PW, DOMAIN, uniq };
