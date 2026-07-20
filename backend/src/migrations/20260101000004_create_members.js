exports.up = function (knex) {
  return knex.schema.createTable('members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('member_code').notNullable().unique(); // e.g. SA-26-27-08
    table.string('name').notNullable();
    table.string('father_name');
    table.string('contact').notNullable();
    table.text('address');
    table.date('validity_start');
    table.date('validity_end');
    table.enu('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['status']);
    table.index(['validity_end']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('members');
};
