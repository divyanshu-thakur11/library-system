const db = require('../db');

// Members with any outstanding (unpaid) balance across all their bills,
// regardless of date. This is the single source of truth for "does this
// member currently owe money" - used both for the Dues tab's Upcoming
// Dues total and for the Cabins tab's FEE DUE highlighting, so the two
// views can never show different members for the same underlying fact.
async function getMemberIdsWithDue() {
  const rows = await db('bills as b')
    .leftJoin(
      db('receipts').select('bill_id').sum('amount_paid as paid_total').groupBy('bill_id').as('r'),
      'r.bill_id',
      'b.id'
    )
    .whereNull('b.voided_at')
    .select('b.member_id')
    .select(db.raw('SUM(b.final_amount - COALESCE(r.paid_total, 0)) as total_due'))
    .groupBy('b.member_id')
    .havingRaw('SUM(b.final_amount - COALESCE(r.paid_total, 0)) > 0.01');
  return new Set(rows.map((r) => r.member_id));
}

module.exports = { getMemberIdsWithDue };