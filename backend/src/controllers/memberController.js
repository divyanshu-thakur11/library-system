const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

async function listMembers(req, res, next) {
  try {
    const { status, search } = req.query;

    // Safer than a per-row correlated subquery: aggregate once, then join.
    const lastPaymentByMember = db('receipts as r')
      .join('bills as b', 'b.id', 'r.bill_id')
      .select('b.member_id')
      .max('r.paid_at as last_payment_date')
      .groupBy('b.member_id')
      .as('lp');

    let query = db('members')
      .leftJoin(lastPaymentByMember, 'lp.member_id', 'members.id')
      .select('members.*', 'lp.last_payment_date')
      // Member IDs look like SA-25-26-08 - a plain text sort would put
      // "10" before "8", so sort by the prefix (groups by year) and then
      // the trailing number itself, cast to an integer.
      .orderByRaw(`substring(members.member_code from '^(.*-)') ASC, NULLIF(substring(members.member_code from '(\\d+)$'), '')::int ASC`);

    if (status) query = query.where({ status });
    if (search) {
      query = query.where((q) => {
        q.whereILike('name', `%${search}%`)
          .orWhereILike('member_code', `%${search}%`)
          .orWhereILike('contact', `%${search}%`);
      });
    }

    const members = await query;
    res.json({ members });
  } catch (err) {
    next(err);
  }
}

async function getMember(req, res, next) {
  try {
    const member = await db('members').where({ id: req.params.id }).first();
    if (!member) throw new AppError(404, 'Member not found');

    const assignments = await db('cabin_assignments as ca')
      .join('cabins as c', 'c.id', 'ca.cabin_id')
      .join('time_slots as ts', 'ts.id', 'ca.time_slot_id')
      .select(
        'ca.id',
        'ca.is_special_case',
        'ca.status',
        'ca.assigned_at',
        'c.id as cabin_id',
        'c.cabin_number',
        'ts.label as slot_label',
        'ts.start_time',
        'ts.end_time'
      )
      .where('ca.member_id', member.id);

    res.json({ member, assignments });
  } catch (err) {
    next(err);
  }
}

async function createMember(req, res, next) {
  try {
    const { member_code, name, father_name, address, validity_start, validity_end, photo_data, date_of_birth, registration_date } = req.body;
    const contact = normalizeContact(req.body.contact);
    if (!member_code || !name || !contact) {
      throw new AppError(400, 'member_code, name and contact are required');
    }
    validateContact(contact);
    if (photo_data) validatePhoto(photo_data);

    const [member] = await db('members')
      .insert({
        member_code,
        name,
        father_name,
        contact,
        address,
        date_of_birth: date_of_birth || null,
        // Validity is now set from the Cabins tab at assignment time, not
        // at member creation - these stay here purely so an admin can still
        // backfill them via the API/import if ever needed.
        validity_start,
        validity_end,
        photo_data: photo_data || null,
        created_by: req.user.id,
        // Registration date defaults to now, but can be explicitly set
        // (e.g. entering a member who actually joined a few days ago).
        created_at: registration_date ? new Date(registration_date) : db.fn.now(),
      })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'MEMBER_CREATED',
      entityType: 'member',
      entityId: member.id,
      after: member,
    });

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
}

async function updateMember(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('members').where({ id }).first();
    if (!before) throw new AppError(404, 'Member not found');

    const allowedFields = [
      'name',
      'father_name',
      'contact',
      'address',
      'date_of_birth',
      // validity_start/validity_end are updated from the Cabins tab
      // (assignment flow), but the field stays PATCH-able here too since
      // that's exactly what the Cabins tab calls under the hood.
      'validity_start',
      'validity_end',
      'status',
      'photo_data',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    // Postgres DATE columns reject '' outright (raw SQL error, not a nice
    // validation message) - an empty string here means "not set", so it
    // needs to become null, not be sent through as-is.
    for (const dateField of ['date_of_birth', 'validity_start', 'validity_end']) {
      if (updates[dateField] === '') updates[dateField] = null;
    }
    if (updates.contact !== undefined) {
      updates.contact = normalizeContact(updates.contact);
      validateContact(updates.contact);
    }
    if (updates.photo_data) validatePhoto(updates.photo_data);
    updates.updated_at = db.fn.now();

    const [after] = await db('members').where({ id }).update(updates).returning('*');

    await logAudit({
      user: req.user,
      actionType: 'MEMBER_UPDATED',
      entityType: 'member',
      entityId: id,
      before,
      after,
    });

    res.json({ member: after });
  } catch (err) {
    next(err);
  }
}

async function getMemberCard(req, res, next) {
  try {
    const member = await db('members').where({ id: req.params.id }).first();
    if (!member) throw new AppError(404, 'Member not found');

    const assignments = await db('cabin_assignments as ca')
      .join('cabins as c', 'c.id', 'ca.cabin_id')
      .join('time_slots as ts', 'ts.id', 'ca.time_slot_id')
      .select(
        'c.cabin_number',
        'ts.label as slot_label',
        'ts.start_time',
        'ts.end_time',
        'ca.assigned_at',
        'ca.is_special_case'
      )
      .where('ca.member_id', member.id)
      .andWhere('ca.status', 'active')
      .orderBy('ca.assigned_at', 'asc');

    res.json({
      member_code: member.member_code,
      name: member.name,
      father_name: member.father_name,
      address: member.address,
      contact: member.contact,
      photo_data: member.photo_data,
      registration_date: member.created_at,
      validity_start: member.validity_start,
      validity_end: member.validity_end,
      cabin_numbers: [...new Set(assignments.map((a) => a.cabin_number))],
      time_slots: assignments.map((a) => ({
        cabin_number: a.cabin_number,
        label: a.slot_label,
        start_time: a.start_time,
        end_time: a.end_time,
        is_special_case: a.is_special_case,
      })),
    });
  } catch (err) {
    next(err);
  }
}

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

// Photo is optional everywhere, but if one is provided it must be a
// reasonably-sized base64 data URL image - keeps the DB row size sane
// since there's no separate file storage in this stateless design.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // ~2MB decoded
function validatePhoto(photoData) {
  if (typeof photoData !== 'string' || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(photoData)) {
    throw new AppError(400, 'Photo must be a PNG, JPEG or WEBP image.');
  }
  const base64Part = photoData.slice(photoData.indexOf(',') + 1);
  const approxBytes = (base64Part.length * 3) / 4;
  if (approxBytes > MAX_PHOTO_BYTES) {
    throw new AppError(400, 'Photo is too large - please use an image under ~2MB.');
  }
}

async function deleteMember(req, res, next) {
  try {
    const { id } = req.params;
    const member = await db('members').where({ id }).first();
    if (!member) throw new AppError(404, 'Member not found');

    // Full delete, on request: this member's bills/receipts sit behind a
    // RESTRICT foreign key (financial records are protected by default),
    // so we clear those explicitly first. Cabin assignments and dues
    // follow-ups CASCADE automatically, but are cleared up front too so
    // the whole operation is one atomic transaction - either everything
    // for this member goes, or (on any failure) none of it does.
    const relatedCounts = await db.transaction(async (trx) => {
      const bills = await trx('bills').where({ member_id: id }).select('id');
      const billIds = bills.map((b) => b.id);
      let receiptCount = 0;
      if (billIds.length) {
        const deletedReceipts = await trx('receipts').whereIn('bill_id', billIds).delete();
        receiptCount = deletedReceipts;
        await trx('bills').where({ member_id: id }).delete();
      }
      const assignmentCount = await trx('cabin_assignments').where({ member_id: id }).delete();
      const followupCount = await trx('dues_followups').where({ member_id: id }).delete();
      await trx('members').where({ id }).delete();
      return { bills: billIds.length, receipts: receiptCount, assignments: assignmentCount, followups: followupCount };
    });

    await logAudit({
      user: req.user,
      actionType: 'MEMBER_DELETED',
      entityType: 'member',
      entityId: id,
      before: member,
      after: { deleted_related: relatedCounts },
    });

    res.json({ ok: true, deleted_related: relatedCounts });
  } catch (err) {
    next(err);
  }
}

// Next serial number for the Member ID, independent of the year prefix -
// e.g. if the highest existing member is ...-15, the next one is 16,
// regardless of what year each was registered in.
async function getNextSerial(req, res, next) {
  try {
    const row = await db('members')
      .select(db.raw(`MAX(NULLIF(substring(member_code from '(\\d+)$'), '')::int) as max_serial`))
      .first();
    const nextSerial = (row?.max_serial || 0) + 1;
    res.json({ next_serial: nextSerial });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMembers, getMember, createMember, updateMember, getMemberCard, deleteMember, getNextSerial };