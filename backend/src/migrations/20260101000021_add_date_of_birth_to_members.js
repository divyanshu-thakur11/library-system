exports.up = function (knex) {
  return knex.schema.alterTable('members', (table) => {
    table.date('date_of_birth');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('members', (table) => {
    table.dropColumn('date_of_birth');
  });
};
