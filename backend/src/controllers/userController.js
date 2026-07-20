const db = require('../db');
const { hashPassword, comparePassword } = require('../utils/password');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

async function listUsers(req, res, next) {
  try {
    const users = await db('users')
      .select('id', 'name', 'email', 'role', 'status', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

// Admin creates manager (or another admin) accounts. Only admins may hit this route.
async function createUser(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      throw new AppError(400, 'name, email, password and role are required');
    }
    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(400, 'role must be admin or manager');
    }

    const password_hash = await hashPassword(password);
    const [user] = await db('users')
      .insert({ name, email: email.toLowerCase(), password_hash, role })
      .returning(['id', 'name', 'email', 'role', 'status', 'created_at']);

    await logAudit({
      user: req.user,
      actionType: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      after: user,
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

async function setUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      throw new AppError(400, 'status must be active or inactive');
    }

    const before = await db('users').where({ id }).first();
    if (!before) throw new AppError(404, 'User not found');

    const [after] = await db('users')
      .where({ id })
      .update({ status, updated_at: db.fn.now() })
      .returning(['id', 'name', 'email', 'role', 'status']);

    await logAudit({
      user: req.user,
      actionType: 'USER_STATUS_CHANGED',
      entityType: 'user',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });

    res.json({ user: after });
  } catch (err) {
    next(err);
  }
}

// Any logged-in user (owner or manager) changes their own password.
async function changeOwnPassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      throw new AppError(400, 'current_password and new_password are required');
    }
    if (new_password.length < 8) {
      throw new AppError(400, 'New password must be at least 8 characters');
    }

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await comparePassword(current_password, user.password_hash);
    if (!valid) throw new AppError(401, 'Current password is incorrect');

    const password_hash = await hashPassword(new_password);
    await db('users').where({ id: user.id }).update({ password_hash, updated_at: db.fn.now() });

    await logAudit({
      user: req.user,
      actionType: 'PASSWORD_CHANGED_SELF',
      entityType: 'user',
      entityId: user.id,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Owner resets a manager's (or their own) password without knowing the old one.
async function resetUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      throw new AppError(400, 'new_password must be at least 8 characters');
    }

    const target = await db('users').where({ id }).first();
    if (!target) throw new AppError(404, 'User not found');

    const password_hash = await hashPassword(new_password);
    await db('users').where({ id }).update({ password_hash, updated_at: db.fn.now() });

    await logAudit({
      user: req.user,
      actionType: 'PASSWORD_RESET_BY_OWNER',
      entityType: 'user',
      entityId: id,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function updateUsername(req, res, next) {
  try {
    const { id } = req.params;
    const { username } = req.body;
    if (!username || !username.trim()) {
      throw new AppError(400, 'username is required');
    }
    const normalized = username.trim().toLowerCase();

    const target = await db('users').where({ id }).first();
    if (!target) throw new AppError(404, 'User not found');

    const clash = await db('users').whereNot({ id }).andWhere({ email: normalized }).first();
    if (clash) throw new AppError(409, 'That username is already taken by another account.');

    const [after] = await db('users')
      .where({ id })
      .update({ email: normalized, updated_at: db.fn.now() })
      .returning(['id', 'name', 'email', 'role', 'status']);

    await logAudit({
      user: req.user,
      actionType: 'USERNAME_CHANGED',
      entityType: 'user',
      entityId: id,
      before: { email: target.email },
      after: { email: after.email },
    });

    res.json({ user: after });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, setUserStatus, changeOwnPassword, resetUserPassword, updateUsername };
