'use strict';
// One-time admin creation. Credentials come from environment variables (server/.env) - nothing is hardcoded.
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (required), SEED_ADMIN_NAME, SEED_ADMIN_PHONE (optional)
const pool = require('../src/db/pool');
const { createPasswordRecord } = require('../src/utils/password');
const { registerBody } = require('../src/validation/auth.schemas');
const { z } = require('zod');

(async () => {
  const input = {
    name: process.env.SEED_ADMIN_NAME || 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  };
  if (!input.email || !input.password) {
    console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in server/.env first.');
    process.exit(1);
  }
  // Reuse the registration rules for name/email/password.
  const parsed = registerBody.pick({ name: true, email: true, password: true }).safeParse(input);
  if (!parsed.success) {
    console.error('Invalid admin settings:\n' + z.prettifyError(parsed.error));
    process.exit(1);
  }
  const phone = (process.env.SEED_ADMIN_PHONE || '').trim() || null;
  try {
    const [existing] = await pool.execute("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (existing.length) {
      console.log('An ADMIN account already exists. Nothing was changed.');
      return;
    }
    const { salt, hash } = createPasswordRecord(parsed.data.password);
    await pool.execute(
      "INSERT INTO users (organization_id, org_type, name, email, phone, role, password_hash, password_salt, status) VALUES (NULL, NULL, ?, ?, ?, 'ADMIN', ?, ?, 'ACTIVE')",
      [parsed.data.name, parsed.data.email, phone, hash, salt],
    );
    console.log(`Admin created for ${parsed.data.email}. Remove SEED_ADMIN_PASSWORD from .env now.`);
  } catch (e) {
    console.error(e.code === 'ER_DUP_ENTRY' ? 'That email is already registered.' : `Seed failed: ${e.code || e.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
