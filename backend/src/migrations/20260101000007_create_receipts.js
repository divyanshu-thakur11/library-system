exports.up = function (knex) {
  return knex.schema.createTable('receipts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('receipt_number').notNullable().unique();
    table
      .uuid('bill_id')
      .notNullable()
      .references('id')
      .inTable('bills')
      .onDelete('RESTRICT');
    table.decimal('amount_paid', 10, 2).notNullable();
    table.decimal('due_amount', 10, 2).notNullable().defaultTo(0);
    table.enu('payment_mode', ['cash', 'online']).notNullable();
    table.timestamp('paid_at').notNullable().defaultTo(knex.fn.now());
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['bill_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('receipts');
};
