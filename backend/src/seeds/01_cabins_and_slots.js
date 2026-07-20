/**
 * Seeds cabins 1-91. Time slots are NOT pre-created here anymore - the
 * Owner/Manager picks the exact hours (1-2 ranges within the library's
 * operating hours) when assigning a member, based on how many hours/day
 * that member wants. The slot rows get created on demand at that point
 * (see cabinController.addTimeSlot).
 *
 * Cabin count is NOT hardcoded anywhere else - use the "+ Add Cabin" /
 * "Remove" controls on the Cabins tab to grow or shrink it later.
 */
exports.seed = async function (knex) {
  await knex('time_slots').del();
  await knex('cabins').del();

  const cabinRows = [];
  for (let i = 1; i <= 91; i++) {
    cabinRows.push({ cabin_number: i });
  }
  await knex('cabins').insert(cabinRows);
};
