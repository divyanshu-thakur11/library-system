exports.up = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.date('pending_validity_start');
    table.date('pending_validity_end');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.dropColumn('pending_validity_start');
    table.dropColumn('pending_validity_end');
  });
};