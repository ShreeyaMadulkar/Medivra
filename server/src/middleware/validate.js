'use strict';
const HttpError = require('../utils/httpError');

/** validateBody(schema) parses req.body with Zod and replaces it with the cleaned value. */
const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!details[key]) details[key] = issue.message;
    }
    return next(new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { details }));
  }
  req.body = result.data;
  next();
};

module.exports = { validateBody };
