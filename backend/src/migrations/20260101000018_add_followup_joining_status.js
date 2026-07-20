// Lets staff record, from the Follow-ups list itself, whether a member
// contacted about dues has indicated they're renewing/continuing or not -
// independent of whether the outstanding payment itself has been settled.
exports.up = function (knex) {
  return knex.schema.alterTable('dues_followups', (table) => {
    table.enu('joining_status', ['undecided', 'joining', 'not_joining']).notNullable().defaultTo('undecided');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('dues_followups', (table) => {
    table.dropColumn('joining_status');
  });
};
