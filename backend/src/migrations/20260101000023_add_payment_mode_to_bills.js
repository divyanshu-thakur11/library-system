exports.up = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.string('payment_mode').defaultTo('cash'); // 'cash' or 'online'
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.dropColumn('payment_mode');
  });
};