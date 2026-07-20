const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

// Returns every follow-up row, newest first, with member info joined in.
// The frontend groups these by member_id and takes the most recent one as
// "current status" - keeping the history around (rather than one row per
// member) means nothing is ever silently overwritten.
async function listFollowups(req, res, next) {
  try {
    const { member_id } = req.query;
    let query = db('dues_followups as f')
      .join('members as m', 'm.id', 'f.member_id')
      .select(
        'f.*',
        'm.member_code',
        'm.name as member_name',
        'm.contact as member_contact'
      )
      .orderBy('f.created_at', 'desc');
    if (member_id) query = query.where('f.member_id', member_id);
    const followups = await query;
    res.json({ followups });
  } catch (err) {
    next(err);
  }
}

async function createFollowup(req, res, next) {
  try {
    const { member_id, category, reason, follow_up_date, next_follow_up_date } = req.body;
    if (!member_id || !category) {
      throw new AppError(400, 'member_id and category are required');
    }
    if (!['overdue', 'expiring_soon', 'upcoming'].includes(category)) {
      throw new AppError(400, 'category must be overdue, expiring_soon or upcoming');
    }

    const [followup] = await db('dues_followups')
      .insert({
        member_id,
        category,
        reason: reason || null,
        follow_up_date: follow_up_date || null,
        next_follow_up_date: next_follow_up_date || null,
        created_by: req.user.id,
      })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'FOLLOWUP_CREATED',
      entityType: 'dues_followup',
      entityId: followup.id,
      after: followup,
    });

    res.status(201).json({ followup });
  } catch (err) {
    next(err);
  }
}

// Updates status (paid / not_paid / vacated) and/or reschedules the next
// follow-up date - covers both the "mark paid" and "they said 3 more days"
// actions from the same endpoint.
async function updateFollowup(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('dues_followups').where({ id }).first();
    if (!before) throw new AppError(404, 'Follow-up not found');

    const allowedFields = ['status', 'reason', 'follow_up_date', 'next_follow_up_date', 'joining_status'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.status && !['pending', 'paid', 'not_paid', 'vacated'].includes(updates.status)) {
      throw new AppError(400, 'Invalid status');
    }
    if (updates.joining_status && !['undecided', 'joining', 'not_joining'].includes(updates.joining_status)) {
      throw new AppError(400, 'Invalid joining_status');
    }
    updates.updated_at = db.fn.now();

    const [after] = await db('dues_followups').where({ id }).update(updates).returning('*');

    await logAudit({
      user: req.user,
      actionType: 'FOLLOWUP_UPDATED',
      entityType: 'dues_followup',
      entityId: id,
      before,
      after,
    });

    res.json({ followup: after });
  } catch (err) {
    next(err);
  }
}

async function deleteFollowup(req, res, next) {
  try {
    const { id } = req.params;
    const followup = await db('dues_followups').where({ id }).first();
    if (!followup) throw new AppError(404, 'Follow-up not found');
    await db('dues_followups').where({ id }).delete();
    await logAudit({
      user: req.user,
      actionType: 'FOLLOWUP_DELETED',
      entityType: 'dues_followup',
      entityId: id,
      before: followup,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listFollowups, createFollowup, updateFollowup, deleteFollowup };
