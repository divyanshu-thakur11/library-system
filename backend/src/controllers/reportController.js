const db = require('../db');
const { todayIST, addDaysIST } = require('../utils/dateIST');

async function summary(req, res, next) {
  try {
    const [
      totalCollections,
      activeMembers,
      totalCabins,
      occupiedSlots,
      totalSlots,
      specialCaseCount,
      expiredMemberships,
    ] = await Promise.all([
      db('receipts').sum('amount_paid as total').first(),
      db('members').where({ status: 'active' }).count('id as count').first(),
      db('cabins').where({ is_active: true }).count('id as count').first(),
      db('cabin_assignments').where({ status: 'active' }).countDistinct('time_slot_id as count').first(),
      db('time_slots').count('id as count').first(),
      db('cabin_assignments').where({ status: 'active', is_special_case: true }).count('id as count').first(),
      db('members')
        .where({ status: 'active' })
        .andWhere('validity_end', '<', db.fn.now())
        .count('id as count')
        .first(),
    ]);

    res.json({
      total_collections: Number(totalCollections.total) || 0,
      active_members: Number(activeMembers.count),
      active_cabins: Number(totalCabins.count),
      cabin_occupancy: {
        occupied_slots: Number(occupiedSlots.count),
        total_slots: Number(totalSlots.count),
      },
      special_case_assignments: Number(specialCaseCount.count),
      expired_memberships: Number(expiredMemberships.count),
    });
  } catch (err) {
    next(err);
  }
}

async function expiredMembershipsList(req, res, next) {
  try {
    const members = await db('members')
      .where('status', 'active')
      .andWhere('validity_end', '<', db.fn.now())
      .orderBy('validity_end', 'asc');
    res.json({ members });
  } catch (err) {
    next(err);
  }
}

async function collectionsByRange(req, res, next) {
  try {
    const { from, to } = req.query;
    let query = db('receipts').select('*').orderBy('paid_at', 'desc');
    if (from) query = query.where('paid_at', '>=', from);
    if (to) query = query.where('paid_at', '<=', to);
    const receipts = await query;
    const total = receipts.reduce((sum, r) => sum + Number(r.amount_paid), 0);
    res.json({ receipts, total });
  } catch (err) {
    next(err);
  }
}

// Bills with an outstanding balance, i.e. part-payments and unpaid bills.
// `from`/`to` filter on the bill's creation date.
async function duesReport(req, res, next) {
  try {
    const { from, to } = req.query;
    let query = db('bills as b')
      .join('members as m', 'm.id', 'b.member_id')
      .leftJoin(
        db('receipts').select('bill_id').sum('amount_paid as paid_total').groupBy('bill_id').as('r'),
        'r.bill_id',
        'b.id'
      )
      .select(
        'b.id',
        'b.bill_number',
        'b.created_at',
        'b.final_amount',
        'm.id as member_id',
        'm.member_code',
        'm.name as member_name',
        'm.contact',
        db.raw('COALESCE(r.paid_total, 0) as paid_total'),
        db.raw('b.final_amount - COALESCE(r.paid_total, 0) as due_amount')
      )
      .whereRaw('b.final_amount - COALESCE(r.paid_total, 0) > 0')
      .andWhere('b.voided_at', null)
      .orderBy('b.created_at', 'desc');

    if (from) query = query.where('b.created_at', '>=', from);
    if (to) query = query.where('b.created_at', '<=', to);

    const dues = await query;
    const total_outstanding = dues.reduce((sum, d) => sum + Number(d.due_amount), 0);
    res.json({ dues, total_outstanding });
  } catch (err) {
    next(err);
  }
}

// Members whose validity has already lapsed, as of `as_of` (defaults to today).
// `from`/`to` further narrow to memberships that expired within that window.
async function overdueMembers(req, res, next) {
  try {
    const { from, to, as_of } = req.query;
    const cutoff = as_of || todayIST();

    let query = db('members').where('status', 'active').andWhere('validity_end', '<', cutoff);
    if (from) query = query.andWhere('validity_end', '>=', from);
    if (to) query = query.andWhere('validity_end', '<=', to);

    const members = await query.orderBy('validity_end', 'asc');
    res.json({ members });
  } catch (err) {
    next(err);
  }
}

// Members whose validity ends within [from, to] (defaults to today..+7 days).
async function expiringSoon(req, res, next) {
  try {
    const today = todayIST();
    const defaultTo = addDaysIST(7);
    const from = req.query.from || today;
    const to = req.query.to || defaultTo;

    const members = await db('members')
      .where('status', 'active')
      .andWhere('validity_end', '>=', from)
      .andWhere('validity_end', '<=', to)
      .orderBy('validity_end', 'asc');

    res.json({ members, from, to });
  } catch (err) {
    next(err);
  }
}

function timeToHours(t) {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

// Ranks cabins by how much free time they have left today (operating
// window minus time already booked by normal, active assignments), with
// number of currently-assigned members as a tiebreaker - lets staff
// quickly see which cabin to offer a new member.
async function bestAvailableCabins(req, res, next) {
  try {
    const settingsRows = await db('system_settings').select('*');
    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const start = settingsMap.operating_hours_start || '06:00';
    const end = settingsMap.operating_hours_end || '23:00';
    const windowHours = timeToHours(end) - timeToHours(start);

    const cabins = await db('cabins').where({ is_active: true }).select('id', 'cabin_number');
    const assignments = await db('cabin_assignments')
      .where({ status: 'active' })
      .select('cabin_id', 'member_id', 'start_time', 'end_time', 'is_special_case');

    const usedByCabin = {};
    const membersByCabin = {};
    for (const a of assignments) {
      (membersByCabin[a.cabin_id] ||= new Set()).add(a.member_id);
      if (!a.is_special_case) {
        const hrs = timeToHours(a.end_time) - timeToHours(a.start_time);
        usedByCabin[a.cabin_id] = (usedByCabin[a.cabin_id] || 0) + hrs;
      }
    }

    const ranked = cabins
      .map((c) => {
        const used = usedByCabin[c.id] || 0;
        const free = Math.max(0, Number((windowHours - used).toFixed(2)));
        const memberCount = membersByCabin[c.id] ? membersByCabin[c.id].size : 0;
        return {
          id: c.id,
          cabin_number: c.cabin_number,
          used_hours: Number(used.toFixed(2)),
          free_hours: free,
          member_count: memberCount,
        };
      })
      .sort((a, b) => b.free_hours - a.free_hours || a.member_count - b.member_count || a.cabin_number - b.cabin_number);

    res.json({ operating_hours: { start, end }, window_hours: windowHours, cabins: ranked });
  } catch (err) {
    next(err);
  }
}

// Members whose birthday is today or within the next `withinDays` days
// (default 3) - compares month/day only (birth year is irrelevant), and
// rolls over to next year for anyone whose birthday already passed this
// year. Sorted soonest-first so "today" always leads.
async function upcomingBirthdays(req, res, next) {
  try {
    const withinDays = Number(req.query.within_days) || 3;
    const members = await db('members')
      .where({ status: 'active' })
      .whereNotNull('date_of_birth')
      .select('id', 'member_code', 'name', 'contact', 'date_of_birth');

    const todayUTC = new Date(`${todayIST()}T00:00:00Z`);

    const upcoming = members
      .map((m) => {
        const dob = new Date(m.date_of_birth);
        const month = dob.getUTCMonth();
        const day = dob.getUTCDate();
        let next = new Date(Date.UTC(todayUTC.getUTCFullYear(), month, day));
        if (next < todayUTC) {
          next = new Date(Date.UTC(todayUTC.getUTCFullYear() + 1, month, day));
        }
        const days_until = Math.round((next - todayUTC) / (24 * 60 * 60 * 1000));
        return { ...m, days_until };
      })
      .filter((m) => m.days_until <= withinDays)
      .sort((a, b) => a.days_until - b.days_until);

    res.json({ members: upcoming });
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, expiredMembershipsList, collectionsByRange, duesReport, overdueMembers, expiringSoon, bestAvailableCabins, upcomingBirthdays };
