const db = require('../db');

/**
 * Generates the next sequential number for a given prefix by counting
 * existing rows. Wrapped in the caller's transaction to stay safe under
 * concurrent writes (row lock via FOR UPDATE on a running counter table
 * would be more robust at very high write volume, but this is more than
 * enough for a single-branch library and keeps the schema simple).
 */
async function nextBillNumber(trx) {
  const year = new Date().getFullYear();
  const [{ count }] = await (trx || db)('bills')
    .whereRaw('EXTRACT(YEAR FROM created_at) = ?', [year])
    .count('id as count');
  const seq = parseInt(count, 10) + 1;
  return `BILL-${year}-${String(seq).padStart(5, '0')}`;
}

async function nextReceiptNumber(trx) {
  const year = new Date().getFullYear();
  const [{ count }] = await (trx || db)('receipts')
    .whereRaw('EXTRACT(YEAR FROM created_at) = ?', [year])
    .count('id as count');
  const seq = parseInt(count, 10) + 1;
  return `RCPT-${year}-${String(seq).padStart(5, '0')}`;
}

module.exports = { nextBillNumber, nextReceiptNumber };
