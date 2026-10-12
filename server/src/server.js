'use strict';
const app = require('./app');
const pool = require('./db/pool');
const { port } = require('./config/env');

(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(`Cannot connect to MySQL (${err.code || err.message}). Check DB_* settings in server/.env.`);
    process.exit(1);
  }
  app.listen(port, () => console.log(`Medivra API listening on http://localhost:${port}`));
})();
