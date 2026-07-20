const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
function normalizeContact(contact) {
  const digits = (contact || '').replace(/\D/g, '');
  return digits.slice(-10);
}
function validateContact(contact) {
  if (!INDIAN_MOBILE_RE.test(contact)) {
    throw new AppError(400, 'Contact must be a valid 10-digit Indian mobile number (starts with 6-9).');
  }
}

async function listDemos(req, res, next) {
  try {
    const { search, joining_status } = req.query;
    let query = db('demos').select('*').orderBy('created_at', 'desc');
    if (search) {
      query = query.where((q) => {
        q.whereILike('name', `%${search}%`).orWhereILike('contact', `%${search}%`);
      });
    }
    if (joining_status) query = query.where('joining_status', joining_status);
    const demos = await query;
    res.json({ demos });
  } catch (err) {
    next(err);
  }
}

async function createDemo(req, res, next) {
  try {
    const {
      name,
      father_name,
      contact: rawContact,
      address,
      notes,
      demo_date,
      follow_up_date,
      next_follow_up_date,
      expected_payment_date,
      joining_status,
    } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const contact = normalizeContact(rawContact);
    validateContact(contact);

    const [demo] = await db('demos')
      .insert({
        name,
        father_name,
        contact,
        address,
        notes,
        demo_date: demo_date || db.fn.now(),
        follow_up_date: follow_up_date || null,
        next_follow_up_date: next_follow_up_date || null,
        expected_payment_date: expected_payment_date || null,
        joining_status: joining_status || 'undecided',
        created_by: req.user.id,
      })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'DEMO_CREATED',
      entityType: 'demo',
      entityId: demo.id,
      after: demo,
    });

    res.status(201).json({ demo });
  } catch (err) {
    next(err);
  }
}

async function updateDemo(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('demos').where({ id }).first();
    if (!before) throw new AppError(404, 'Demo not found');

    const allowedFields = [
      'name',
      'father_name',
      'contact',
      'address',
      'notes',
      'demo_date',
      'follow_up_date',
      'next_follow_up_date',
      'expected_payment_date',
      'joining_status',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    for (const dateField of ['demo_date', 'follow_up_date', 'next_follow_up_date', 'expected_payment_date']) {
      if (updates[dateField] === '') updates[dateField] = null;
    }
    if (updates.contact !== undefined) {
      updates.contact = normalizeContact(updates.contact);
      validateContact(updates.contact);
    }
    updates.updated_at = db.fn.now();

    const [after] = await db('demos').where({ id }).update(updates).returning('*');

    await logAudit({
      user: req.user,
      actionType: 'DEMO_UPDATED',
      entityType: 'demo',
      entityId: id,
      before,
      after,
    });

    res.json({ demo: after });
  } catch (err) {
    next(err);
  }
}

async function deleteDemo(req, res, next) {
  try {
    const { id } = req.params;
    const demo = await db('demos').where({ id }).first();
    if (!demo) throw new AppError(404, 'Demo not found');
    await db('demos').where({ id }).delete();
    await logAudit({
      user: req.user,
      actionType: 'DEMO_DELETED',
      entityType: 'demo',
      entityId: id,
      before: demo,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDemos, createDemo, updateDemo, deleteDemo };