exports.up = function (knex) {
  return knex.schema.alterTable('enquiries', (table) => {
    table.string('father_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('enquiries', (table) => {
    table.dropColumn('father_name');
  });
};
