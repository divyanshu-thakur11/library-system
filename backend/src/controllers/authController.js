const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { comparePassword } = require('../utils/password');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

const cookieOpts = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
};

async function login(req, res, next) {
  try {
    const { email, password, portal } = req.body;
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const user = await db('users').where({ email: email.toLowerCase() }).first();
    if (!user || user.status !== 'active') {
      throw new AppError(401, 'Invalid credentials');
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials');
    }

    // portal is 'owner' or 'manager', set by which login page was used.
    // 'admin' role = Owner. This just gives a clear error instead of a
    // manager silently landing on the wrong login form.
    if (portal === 'owner' && user.role !== 'admin') {
      throw new AppError(403, 'This is not an Owner account. Use the Manager login page.');
    }
    if (portal === 'manager' && user.role !== 'manager') {
      throw new AppError(403, 'This is not a Manager account. Use the Owner login page.');
    }

    const safeUser = { id: user.id, role: user.role, name: user.name };
    const accessToken = signAccessToken(safeUser);
    const refreshToken = signRefreshToken(safeUser);

    res.cookie('access_token', accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...cookieOpts,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await logAudit({
      user: safeUser,
      actionType: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
    });

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.clearCookie('access_token', cookieOpts);
  res.clearCookie('refresh_token', cookieOpts);
  res.json({ ok: true });
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) throw new AppError(401, 'Not authenticated');

    const payload = jwt.verify(token, config.jwt.refreshSecret);
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user || user.status !== 'active') throw new AppError(401, 'Not authenticated');

    const safeUser = { id: user.id, role: user.role, name: user.name };
    const accessToken = signAccessToken(safeUser);
    res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.json({ ok: true });
  } catch (err) {
    next(new AppError(401, 'Not authenticated'));
  }
}

module.exports = { login, logout, me, refresh };