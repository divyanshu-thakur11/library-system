exports.up = function (knex) {
  return knex.schema.createTable('bills', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('bill_number').notNullable().unique();
    table
      .uuid('member_id')
      .notNullable()
      .references('id')
      .inTable('members')
      .onDelete('RESTRICT');
    table
      .uuid('cabin_id')
      .references('id')
      .inTable('cabins')
      .onDelete('SET NULL');
    table.string('package_type').notNullable(); // e.g. Monthly, 2 Month, Quarterly
    table.decimal('total_hours', 6, 2);
    table.decimal('base_amount', 10, 2).notNullable();
    table.decimal('discount', 10, 2).notNullable().defaultTo(0);
    table.decimal('final_amount', 10, 2).notNullable();
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['member_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('bills');
};
