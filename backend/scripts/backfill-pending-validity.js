// One-time backfill: estimates pending_validity_start/end for OLD bills
// that predate this feature, so they show up in Reports > Member Lookup's
// "Validity Granted" column.
//
// This is a BEST-GUESS reconstruction, not the exact original record -
// that data was never captured at the time. It only fills in bills that:
//   - are tied to a Fee Structure (so we know a duration to work with)
//   - are fully paid (due_amount <= 0)
//   - don't already have a pending_validity_start/end set
//
// Estimate used: validity ran from the bill's creation date, for that fee
// structure's duration_months. Bills created with a custom/manual amount
// (no fee structure) are left untouched - there's no duration to infer.
//
// Run once from the backend/ directory:
//   node scripts/backfill-pending-validity.js
//
// Safe to run more than once - it only ever touches rows that are still
// blank, so it won't overwrite anything (including rows this same script
// already filled in on a prior run).

const db = require('../src/db');

async function run() {
  const candidates = await db('bills as b')
    .leftJoin(
      db('receipts').select('bill_id').sum('amount_paid as paid_total').groupBy('bill_id').as('r'),
      'r.bill_id',
      'b.id'
    )
    .join('fee_structures as fs', 'fs.id', 'b.fee_structure_id')
    .whereNull('b.voided_at')
    .whereNull('b.pending_validity_start')
    .whereNull('b.pending_validity_end')
    .whereRaw('b.final_amount - COALESCE(r.paid_total, 0) <= 0.01')
    .select('b.id', 'b.created_at', 'b.bill_number', 'fs.duration_months');

  console.log(`Found ${candidates.length} old, fully-paid, fee-structure bill(s) eligible for backfill.`);

  let updated = 0;
  for (const bill of candidates) {
    const start = new Date(bill.created_at);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + bill.duration_months);

    await db('bills')
      .where({ id: bill.id })
      .update({
        pending_validity_start: start.toISOString().slice(0, 10),
        pending_validity_end: end.toISOString().slice(0, 10),
      });

    console.log(`  ${bill.bill_number}: set ${start.toISOString().slice(0, 10)} -> ${end.toISOString().slice(0, 10)}`);
    updated++;
  }

  console.log(`Done. Backfilled ${updated} bill(s).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});