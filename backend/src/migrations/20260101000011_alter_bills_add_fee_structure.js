exports.up = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table
      .uuid('fee_structure_id')
      .references('id')
      .inTable('fee_structures')
      .onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.dropColumn('fee_structure_id');
  });
};
