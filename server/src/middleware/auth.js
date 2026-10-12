'use strict';
const HttpError = require('../utils/httpError');
const { verifyToken } = require('../services/token.service');
const { loadActiveUser } = require('../services/user.service');

const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');

/**
 * Verifies the Bearer JWT (signature + expiry), then RELOADS the user from the database.
 * Sets:
 *   req.auth = decoded token claims (informational only)
 *   req.user = { id, role, organizationId, organizationType, publicUser }  <- authoritative, from the DB
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      throw unauthorized(); // same response for expired / tampered / malformed tokens
    }
    const user = await loadActiveUser(claims.sub);
    if (!user) throw unauthorized();

    req.auth = claims;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** For later phases: requireRole('DISTRIBUTOR') etc. Uses the role loaded from the DB, not the token. */
const requireRole = (...roles) => (req, _res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this.'));

module.exports = { authenticate, requireRole };
