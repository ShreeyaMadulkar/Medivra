'use strict';
const mysql = require('mysql2/promise');
const { db } = require('../config/env');

const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // JS Dates <-> UTC
  charset: 'utf8mb4',
});

// Every connection works in UTC so NOW(3) and DATETIME columns agree with the JS driver.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

module.exports = pool;
