exports.up = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.timestamp('voided_at');
    table.text('void_reason');
    table
      .uuid('voided_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('bills', (table) => {
    table.dropColumn('voided_at');
    table.dropColumn('void_reason');
    table.dropColumn('voided_by');
  });
};
