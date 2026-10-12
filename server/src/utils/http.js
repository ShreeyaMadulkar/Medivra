'use strict';
const { z } = require('zod');
const HttpError = require('./httpError');

/** Parses a numeric path id. Invalid ids -> 400 (never reaches SQL). Returned as a string for BIGINT params. */
function parseId(value, label = 'id') {
  if (!/^[1-9]\d{0,18}$/.test(String(value))) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${label}.`);
  }
  return String(value);
}

/** Validates req.query with a Zod schema (Express 5: req.query is read-only, so we return the parsed value). */
function parseQuery(schema, query) {
  const r = schema.safeParse(query || {});
  if (!r.success) {
    const details = {};
    for (const i of r.error.issues) details[i.path.join('.') || '_'] ??= i.message;
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid query parameters.', { details });
  }
  return r.data;
}

const pageQuery = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** LIMIT/OFFSET are validated integers, so they are safe to inline (prepared-statement LIMIT ? is unreliable in MySQL 8+). */
const limitClause = ({ page, limit }) => `LIMIT ${Number(limit)} OFFSET ${(Number(page) - 1) * Number(limit)}`;
const pagination = ({ page, limit }, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

/** Escapes % _ \ so user text is matched literally inside LIKE. */
const likeTerm = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const actorOf = (req) => ({ userId: req.user.id, role: req.user.role, organizationId: req.user.organizationId, ip: req.ip || null });
const todayUtc = () => new Date().toISOString().slice(0, 10);

module.exports = { parseId, parseQuery, pageQuery, limitClause, pagination, likeTerm, actorOf, todayUtc };
