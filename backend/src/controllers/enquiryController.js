const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

// Same 10-digit Indian mobile rule used for real members - a lead's number
// needs to actually be reachable on WhatsApp/phone for follow-ups to work.
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

// Enquiries deliberately never touch the `members` table - they only ever
// surface here and (read-only, by name/contact search) as autofill options
// when someone actually creates a member from the Members tab.
async function listEnquiries(req, res, next) {
  try {
    const { search, joining_status } = req.query;
    let query = db('enquiries').select('*').orderBy('created_at', 'desc');
    if (search) {
      query = query.where((q) => {
        q.whereILike('name', `%${search}%`).orWhereILike('contact', `%${search}%`);
      });
    }
    if (joining_status) query = query.where('joining_status', joining_status);
    const enquiries = await query;
    res.json({ enquiries });
  } catch (err) {
    next(err);
  }
}

async function createEnquiry(req, res, next) {
  try {
    const { name, father_name, contact: rawContact, address, notes, enquiry_date, follow_up_date, next_follow_up_date, joining_status } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const contact = normalizeContact(rawContact);
    validateContact(contact);

    const [enquiry] = await db('enquiries')
      .insert({
        name,
        father_name,
        contact,
        address,
        notes,
        enquiry_date: enquiry_date || db.fn.now(),
        follow_up_date: follow_up_date || null,
        next_follow_up_date: next_follow_up_date || null,
        joining_status: joining_status || 'undecided',
        created_by: req.user.id,
      })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'ENQUIRY_CREATED',
      entityType: 'enquiry',
      entityId: enquiry.id,
      after: enquiry,
    });

    res.status(201).json({ enquiry });
  } catch (err) {
    next(err);
  }
}

async function updateEnquiry(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('enquiries').where({ id }).first();
    if (!before) throw new AppError(404, 'Enquiry not found');

    const allowedFields = ['name', 'father_name', 'contact', 'address', 'notes', 'enquiry_date', 'follow_up_date', 'next_follow_up_date', 'joining_status'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    for (const dateField of ['enquiry_date', 'follow_up_date', 'next_follow_up_date']) {
      if (updates[dateField] === '') updates[dateField] = null;
    }
    if (updates.contact !== undefined) {
      updates.contact = normalizeContact(updates.contact);
      validateContact(updates.contact);
    }
    updates.updated_at = db.fn.now();

    const [after] = await db('enquiries').where({ id }).update(updates).returning('*');

    await logAudit({
      user: req.user,
      actionType: 'ENQUIRY_UPDATED',
      entityType: 'enquiry',
      entityId: id,
      before,
      after,
    });

    res.json({ enquiry: after });
  } catch (err) {
    next(err);
  }
}

async function deleteEnquiry(req, res, next) {
  try {
    const { id } = req.params;
    const enquiry = await db('enquiries').where({ id }).first();
    if (!enquiry) throw new AppError(404, 'Enquiry not found');
    await db('enquiries').where({ id }).delete();
    await logAudit({
      user: req.user,
      actionType: 'ENQUIRY_DELETED',
      entityType: 'enquiry',
      entityId: id,
      before: enquiry,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEnquiries, createEnquiry, updateEnquiry, deleteEnquiry };
