'use strict';
// Applies schema.sql to the database named in .env (DB_NAME). Non-destructive: CREATE TABLE IF NOT EXISTS only.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

async function applySchema(database = db.database, cfg = db) {
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database, multipleStatements: true,
  });
  try {
    await conn.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
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
