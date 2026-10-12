'use strict';
const HttpError = require('../utils/httpError');

const notFound = (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Resource not found.'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const { headers, ...rest } = err.extra;
    if (headers) for (const [k, v] of Object.entries(headers)) res.set(k, v);
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...rest } });
  }
  // body-parser problems (malformed JSON, payload too large)
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    const status = err.type === 'entity.too.large' ? 413 : 400;
    return res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request body.' } });
  }
  // Log only the error name/code - never request bodies, passwords, tokens or SQL parameters.
  console.error(`[error] ${err?.name || 'Error'}${err?.code ? ` (${err.code})` : ''}: ${String(err?.message || '').split('\n')[0]}`);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};

module.exports = { notFound, errorHandler };
