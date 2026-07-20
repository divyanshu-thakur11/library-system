const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

/**
 * Core rule (spec section 5, refined to cover arbitrary custom time
 * ranges): a cabin may have at most one ACTIVE, non-special-case
 * assignment covering any given moment in time. Two normal assignments
 * whose time ranges overlap AT ALL are blocked, even if they aren't the
 * exact same time_slot row (e.g. 7am-10am and 8am-11am both touch the
 * cabin at 8-10am and must not both be "normal").
 *
 *  - Enforced here with a friendly, specific error pointing at the
 *    Special Case option.
 *  - Enforced again at the DB level via the `cabin_assignments_no_overlap`
 *    exclusion constraint (migration 000012), which cannot be bypassed by
 *    a race condition or a future bug - it compares actual time ranges,
 *    not just identical rows.
 *  - is_special_case = true: skips both checks entirely and is added
 *    alongside whatever is already there. Nothing existing is touched.
 */
async function assignCabin(req, res, next) {
  try {
    const { member_id, cabin_id, time_slot_id, is_special_case = false, special_case_reason } = req.body;

    if (!member_id || !cabin_id || !time_slot_id) {
      throw new AppError(400, 'member_id, cabin_id and time_slot_id are required');
    }
    if (is_special_case && !special_case_reason) {
      throw new AppError(400, 'special_case_reason is required when Special Case Assignment is checked');
    }

    const [member, cabin, slot, settingsRows] = await Promise.all([
      db('members').where({ id: member_id }).first(),
      db('cabins').where({ id: cabin_id }).first(),
      db('time_slots').where({ id: time_slot_id, cabin_id }).first(),
      db('system_settings').whereIn('key', ['operating_hours_start', 'operating_hours_end']),
    ]);
    if (!member) throw new AppError(404, 'Member not found');
    if (!cabin) throw new AppError(404, 'Cabin not found');
    if (!slot) throw new AppError(404, 'Time slot not found for this cabin');

    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const opensAt = settingsMap.operating_hours_start || '06:00';
    const closesAt = settingsMap.operating_hours_end || '23:00';
    if (slot.start_time < `${opensAt}:00` || slot.end_time > `${closesAt}:00`) {
      throw new AppError(400, `This time range falls outside library hours (${opensAt}–${closesAt}).`);
    }

    const result = await db.transaction(async (trx) => {
      if (!is_special_case) {
        // Friendly pre-check for ANY overlapping normal assignment in this
        // cabin, not just an identical slot - before we hit the DB
        // exclusion constraint, so the manager gets a clear message.
        const overlapping = await trx('cabin_assignments')
          .where({ cabin_id, status: 'active', is_special_case: false })
          .andWhere('start_time', '<', slot.end_time)
          .andWhere('end_time', '>', slot.start_time)
          .first();
        if (overlapping) {
          throw new AppError(
            409,
            `This cabin is already booked from ${overlapping.start_time.slice(0, 5)} to ${overlapping.end_time.slice(0, 5)}, which overlaps the requested time. Check "Special Case Assignment" to add another member without removing the existing one.`
          );
        }
      }

      const [assignment] = await trx('cabin_assignments')
        .insert({
          member_id,
          cabin_id,
          time_slot_id,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_special_case,
          special_case_reason: is_special_case ? special_case_reason : null,
          assigned_by: req.user.id,
        })
        .returning('*');

      await logAudit(
        {
          user: req.user,
          actionType: is_special_case ? 'SPECIAL_CASE_ASSIGNED' : 'CABIN_ASSIGNED',
          entityType: 'cabin_assignment',
          entityId: assignment.id,
          after: {
            member_code: member.member_code,
            cabin_number: cabin.cabin_number,
            slot: slot.label,
            is_special_case,
            special_case_reason: special_case_reason || null,
          },
        },
        trx
      );

      return assignment;
    });

    res.status(201).json({ assignment: result });
  } catch (err) {
    next(err);
  }
}

// Ends (does not delete) an assignment - existing history/audit trail is preserved.
async function endAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('cabin_assignments').where({ id }).first();
    if (!before) throw new AppError(404, 'Assignment not found');
    if (before.status === 'ended') throw new AppError(400, 'Assignment already ended');

    const [after] = await db('cabin_assignments')
      .where({ id })
      .update({ status: 'ended', ended_at: db.fn.now() })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'CABIN_ASSIGNMENT_ENDED',
      entityType: 'cabin_assignment',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status },
    });

    res.json({ assignment: after });
  } catch (err) {
    next(err);
  }
}

// Ends every active assignment for a member at once ("vacate" from Members
// tab) and marks them inactive - this is used as "this member has left",
// so they should also drop out of Overdue/Expiring Soon (both of which
// only ever show active members).
async function vacateMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const active = await db('cabin_assignments').where({ member_id: memberId, status: 'active' });

    await db.transaction(async (trx) => {
      if (active.length > 0) {
        await trx('cabin_assignments')
          .where({ member_id: memberId, status: 'active' })
          .update({ status: 'ended', ended_at: trx.fn.now() });
      }

      await trx('members').where({ id: memberId }).update({ status: 'inactive', updated_at: trx.fn.now() });

      await logAudit(
        {
          user: req.user,
          actionType: 'MEMBER_VACATED',
          entityType: 'member',
          entityId: memberId,
          before: { active_assignments: active.length, status: 'active' },
          after: { active_assignments: 0, status: 'inactive' },
        },
        trx
      );
    });

    res.json({ ended: active.length });
  } catch (err) {
    next(err);
  }
}

async function listSpecialCases(req, res, next) {
  try {
    const rows = await db('cabin_assignments as ca')
      .join('members as m', 'm.id', 'ca.member_id')
      .join('cabins as c', 'c.id', 'ca.cabin_id')
      .join('time_slots as ts', 'ts.id', 'ca.time_slot_id')
      .select(
        'ca.id',
        'ca.special_case_reason',
        'ca.assigned_at',
        'ca.status',
        'm.member_code',
        'm.name as member_name',
        'c.cabin_number',
        'ts.label as slot_label'
      )
      .where('ca.is_special_case', true)
      .orderBy('ca.assigned_at', 'desc');

    res.json({ special_cases: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { assignCabin, endAssignment, vacateMember, listSpecialCases };