'use strict';
// Applies schema.sql (Phase 1) then schema.phase2.sql to the database named in .env (DB_NAME).
// Non-destructive: CREATE TABLE IF NOT EXISTS only. Safe to run repeatedly.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const FILES = ['schema.sql', 'schema.phase2.sql'];

async function applySchema(database = db.database, cfg = db) {
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database, multipleStatements: true,
  });
  try {
    for (const f of FILES) await conn.query(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  } finally {
    await conn.end();
  }
}
module.exports = { applySchema };

if (require.main === module) {
  applySchema()
    .then(() => console.log(`Schema applied to database "${db.database}" (existing tables and data left untouched).`))
    .catch((e) => { console.error(`Schema setup failed: ${e.code || e.message}`); process.exit(1); });
}
