'use strict';
const pool = require('../db/pool');

const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

/** Runs fn(conn) inside a transaction; commits on success, rolls back on error, retries on deadlock. */
async function withTransaction(fn, attempts = 3) {
  for (let i = 1; ; i += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (RETRYABLE.has(err.code) && i < attempts) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}
module.exports = { withTransaction };
