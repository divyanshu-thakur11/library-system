const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Reads the access token from an HttpOnly cookie (falls back to
 * Authorization: Bearer for API clients/testing tools). Rejecting
 * client-supplied role/org/user fields anywhere else in the app - the
 * JWT payload set here is the single source of truth for who the
 * requester is.
 */
function authenticate(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.access_token || bearer;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);
    req.user = {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Usage: requireRole('admin') or requireRole('admin', 'manager')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
