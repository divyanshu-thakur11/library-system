// The library operates in India, but the server itself may run in any
// timezone (Render's default is UTC). `new Date().toISOString().slice(0,10)`
// gives the UTC calendar date, which is a day behind IST for roughly the
// first 5.5 hours after midnight IST - meaning "today's" overdue/expiring
// cutoffs and default date ranges would be silently stale during exactly
// that window every night. This computes the IST calendar date instead,
// regardless of what timezone the server process itself is running in.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function todayIST(fromDate = new Date()) {
  return new Date(fromDate.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDaysIST(days, fromDate = new Date()) {
  return todayIST(new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000));
}

module.exports = { todayIST, addDaysIST };
