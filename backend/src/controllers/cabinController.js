const db = require('../db');
const { getMemberIdsWithDue } = require('../utils/duesHelper');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');
const { todayIST } = require('../utils/dateIST');

async function listCabins(req, res, next) {
  try {
    const cabins = await db('cabins').select('*').orderBy('cabin_number', 'asc');
    const slots = await db('time_slots').select('*');

    const slotsByCabin = slots.reduce((acc, slot) => {
      (acc[slot.cabin_id] ||= []).push(slot);
      return acc;
    }, {});

    res.json({
      cabins: cabins.map((c) => ({ ...c, time_slots: slotsByCabin[c.id] || [] })),
    });
  } catch (err) {
    next(err);
  }
}

// Cabin-wise assignment board: every slot, every current member, special
// cases clearly flagged. This powers the "Cabin View" page (section 8).
async function getCabinView(req, res, next) {
  try {
    const cabins = await db('cabins').select('*').orderBy('cabin_number', 'asc');
    const slots = await db('time_slots').select('*');
    const assignments = await db('cabin_assignments as ca')
      .join('members as m', 'm.id', 'ca.member_id')
      .select(
        'ca.id',
        'ca.cabin_id',
        'ca.time_slot_id',
        'ca.is_special_case',
        'ca.special_case_reason',
        'm.id as member_id',
        'm.member_code',
        'm.name as member_name',
        'm.status as member_status',
        'm.validity_start',
        'm.validity_end'
      )
      .where('ca.status', 'active');

    // Single shared source of truth for "who currently owes money" - see
    // utils/duesHelper.js. Using the same helper the Dues tab relies on
    // guarantees these two views can never disagree about who's flagged.
    const membersWithDue = await getMemberIdsWithDue();

    // Same definition as the Dues tab's "Overdue Members" report: active
    // members whose validity has already lapsed.
    const overdueRows = await db('members')
      .where('status', 'active')
      .andWhere('validity_end', '<', todayIST())
      .select('id');
    const overdueMemberIds = new Set(overdueRows.map((r) => r.id));

    const slotsByCabin = slots.reduce((acc, s) => {
      (acc[s.cabin_id] ||= []).push(s);
      return acc;
    }, {});
    const assignmentsBySlot = assignments.reduce((acc, a) => {
      a.has_due = membersWithDue.has(a.member_id);
      a.is_overdue = overdueMemberIds.has(a.member_id);
      (acc[a.time_slot_id] ||= []).push(a);
      return acc;
    }, {});

    const board = cabins.map((cabin) => ({
      ...cabin,
      time_slots: (slotsByCabin[cabin.id] || []).map((slot) => ({
        ...slot,
        members: assignmentsBySlot[slot.id] || [],
      })),
    }));

    res.json({ cabins: board });
  } catch (err) {
    next(err);
  }
}

async function createCabin(req, res, next) {
  try {
    let { cabin_number, time_slots = [] } = req.body;

    const result = await db.transaction(async (trx) => {
      if (cabin_number === undefined || cabin_number === null) {
        // Serializes concurrent "auto-assign next number" requests so two
        // people clicking "+ Add Cabin" at the same instant can't both
        // compute the same number - the lock is held only for this
        // transaction and released automatically on commit/rollback.
        await trx.raw("SELECT pg_advisory_xact_lock(hashtext('cabins_next_number'))");
        const [{ max }] = await trx('cabins').max('cabin_number as max');
        cabin_number = (max || 0) + 1;
      }

      const [cabin] = await trx('cabins').insert({ cabin_number }).returning('*');

      let insertedSlots = [];
      if (time_slots.length > 0) {
        insertedSlots = await trx('time_slots')
          .insert(
            time_slots.map((s) => ({
              cabin_id: cabin.id,
              label: s.label,
              start_time: s.start_time,
              end_time: s.end_time,
            }))
          )
          .returning('*');
      }

      await logAudit(
        {
          user: req.user,
          actionType: 'CABIN_CREATED',
          entityType: 'cabin',
          entityId: cabin.id,
          after: { ...cabin, time_slots: insertedSlots },
        },
        trx
      );

      return { ...cabin, time_slots: insertedSlots };
    });

    res.status(201).json({ cabin: result });
  } catch (err) {
    next(err);
  }
}

async function addTimeSlot(req, res, next) {
  try {
    const { cabinId } = req.params;
    const { label, start_time, end_time } = req.body;
    if (!start_time || !end_time) {
      throw new AppError(400, 'start_time and end_time are required');
    }
    if (start_time >= end_time) {
      throw new AppError(400, 'start_time must be before end_time');
    }

    const cabin = await db('cabins').where({ id: cabinId }).first();
    if (!cabin) throw new AppError(404, 'Cabin not found');

    // Find-or-create: the hours-based assignment flow calls this every time
    // a manager/owner picks a time range, so re-using an identical existing
    // slot (rather than erroring on the unique constraint) keeps that flow
    // simple on the frontend.
    let slot = await db('time_slots').where({ cabin_id: cabinId, start_time, end_time }).first();
    let created = false;

    if (!slot) {
      [slot] = await db('time_slots')
        .insert({
          cabin_id: cabinId,
          label: label || `${start_time.slice(0, 5)}–${end_time.slice(0, 5)}`,
          start_time,
          end_time,
        })
        .returning('*');
      created = true;

      await logAudit({
        user: req.user,
        actionType: 'TIME_SLOT_CREATED',
        entityType: 'time_slot',
        entityId: slot.id,
        after: slot,
      });
    }

    res.status(created ? 201 : 200).json({ time_slot: slot });
  } catch (err) {
    next(err);
  }
}

async function setCabinActive(req, res, next) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const before = await db('cabins').where({ id }).first();
    if (!before) throw new AppError(404, 'Cabin not found');

    const [after] = await db('cabins')
      .where({ id })
      .update({ is_active, updated_at: db.fn.now() })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'CABIN_STATUS_CHANGED',
      entityType: 'cabin',
      entityId: id,
      before: { is_active: before.is_active },
      after: { is_active: after.is_active },
    });

    res.json({ cabin: after });
  } catch (err) {
    next(err);
  }
}

// Occupancy as of a specific date - powers the Occupancy Calendar tab.
// An assignment "occupies" a slot on `date` if it was assigned on/before
// that date and either still active or ended after that date.
async function getOccupancyByDate(req, res, next) {
  try {
    const date = req.query.date || todayIST();

    const cabins = await db('cabins').select('*').orderBy('cabin_number', 'asc');
    const slots = await db('time_slots').select('*');
    const assignments = await db('cabin_assignments as ca')
      .join('members as m', 'm.id', 'ca.member_id')
      .select(
        'ca.id',
        'ca.cabin_id',
        'ca.time_slot_id',
        'ca.is_special_case',
        'ca.assigned_at',
        'ca.ended_at',
        'm.id as member_id',
        'm.member_code',
        'm.name as member_name',
        'm.validity_start',
        'm.validity_end'
      )
      .where('ca.assigned_at', '<=', `${date} 23:59:59`)
      .andWhere((q) => q.whereNull('ca.ended_at').orWhere('ca.ended_at', '>', `${date} 00:00:00`));

    const slotsByCabin = slots.reduce((acc, s) => {
      (acc[s.cabin_id] ||= []).push(s);
      return acc;
    }, {});
    const assignmentsBySlot = assignments.reduce((acc, a) => {
      (acc[a.time_slot_id] ||= []).push(a);
      return acc;
    }, {});

    const board = cabins.map((cabin) => ({
      ...cabin,
      time_slots: (slotsByCabin[cabin.id] || []).map((slot) => {
        const members = assignmentsBySlot[slot.id] || [];
        return {
          ...slot,
          members,
          is_occupied: members.some((m) => !m.is_special_case) || members.length > 0,
        };
      }),
    }));

    res.json({ date, cabins: board });
  } catch (err) {
    next(err);
  }
}

// Suggests the best available cabin(s) for a member given the time range(s)
// they need. "Best" = no overlap with any existing normal assignment for
// ALL requested ranges, ranked ahead of cabins that already have activity
// on unrelated slots (so we spread load evenly) and finally by cabin number.
// Special-case assignments are ignored here since they're exempt from the
// normal one-member-per-slot rule anyway.
async function suggestCabin(req, res, next) {
  try {
    const { slots = [], validity_start, validity_end } = req.body;
    if (!Array.isArray(slots) || slots.length === 0) {
      throw new AppError(400, 'Provide at least one time range ({ start_time, end_time }) to get a suggestion.');
    }
    for (const s of slots) {
      if (!s.start_time || !s.end_time || s.start_time >= s.end_time) {
        throw new AppError(400, 'Each time range needs a start_time before its end_time.');
      }
    }

    const cabins = await db('cabins').where({ is_active: true }).orderBy('cabin_number', 'asc');
    // Times live on time_slots, not cabin_assignments - join to get them.
    // (Previously this compared a.start_time/a.end_time directly on the
    // assignment row, which don't exist there, so every cabin silently
    // looked conflict-free regardless of the requested time range.)
    const activeAssignments = await db('cabin_assignments as ca')
      .join('time_slots as ts', 'ts.id', 'ca.time_slot_id')
      .where('ca.status', 'active')
      .andWhere('ca.is_special_case', false)
      .select('ca.cabin_id', 'ts.start_time', 'ts.end_time');

    const assignmentsByCabin = activeAssignments.reduce((acc, a) => {
      (acc[a.cabin_id] ||= []).push(a);
      return acc;
    }, {});

    const results = cabins.map((cabin) => {
      const existing = assignmentsByCabin[cabin.id] || [];
      const conflicts = slots.filter((s) =>
        existing.some((a) => a.start_time < s.end_time && s.start_time < a.end_time)
      );
      return {
        id: cabin.id,
        cabin_number: cabin.cabin_number,
        available: conflicts.length === 0,
        conflicting_ranges: conflicts.map((c) => `${c.start_time.slice ? c.start_time : c.start_time}–${c.end_time}`),
        current_load: existing.length,
      };
    });

    // Available cabins first (fewest existing bookings first, to spread
    // load evenly), then unavailable ones as a fallback reference list.
    results.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.current_load !== b.current_load) return a.current_load - b.current_load;
      return a.cabin_number - b.cabin_number;
    });

    const best = results.find((r) => r.available) || null;

    res.json({
      best_cabin: best,
      all_cabins: results,
      requested_slots: slots,
      note: validity_end
        ? `Suggestion based on availability for the requested hours; validity ${validity_start || '—'} to ${validity_end} is applied separately when you save the assignment.`
        : undefined,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteCabin(req, res, next) {
  try {
    const { id } = req.params;
    const cabin = await db('cabins').where({ id }).first();
    if (!cabin) throw new AppError(404, 'Cabin not found');

    await db('cabins').where({ id }).delete();

    await logAudit({
      user: req.user,
      actionType: 'CABIN_DELETED',
      entityType: 'cabin',
      entityId: id,
      before: cabin,
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return next(new AppError(409, `Cannot remove Cabin ${req.params.id} - it has assignment history. Use the deactivate toggle instead to hide it without losing records.`));
    }
    next(err);
  }
}

module.exports = {
  listCabins,
  getCabinView,
  getOccupancyByDate,
  createCabin,
  addTimeSlot,
  setCabinActive,
  deleteCabin,
  suggestCabin,
};