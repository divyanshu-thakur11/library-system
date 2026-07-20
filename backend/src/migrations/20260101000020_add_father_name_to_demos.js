exports.up = function (knex) {
  return knex.schema.alterTable('demos', (table) => {
    table.string('father_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('demos', (table) => {
    table.dropColumn('father_name');
  });
};
