'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const batchRoutes = require('./routes/batch.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const transferRoutes = require('./routes/transfer.routes');
const auditRoutes = require('./routes/audit.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)), // allow listed origins (and non-browser clients)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api', adminRoutes); // /organizations, /users, /admin/overview

app.use(notFound);
app.use(errorHandler);

module.exports = app;
