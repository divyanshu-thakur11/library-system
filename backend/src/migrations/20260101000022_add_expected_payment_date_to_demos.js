exports.up = function (knex) {
  return knex.schema.alterTable('demos', (table) => {
    table.date('expected_payment_date');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('demos', (table) => {
    table.dropColumn('expected_payment_date');
  });
};