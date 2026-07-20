// Demo trials - same idea as enquiries: NOT real members until they are
// actually converted (cabin assignment + receipt), so this is a separate
// table that never feeds the Members tab directly.
exports.up = function (knex) {
  return knex.schema.createTable('demos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('contact');
    table.text('address');
    table.text('notes');
    table.date('demo_date').notNullable().defaultTo(knex.fn.now());
    table.date('follow_up_date');
    table.date('next_follow_up_date');
    table.enu('joining_status', ['undecided', 'joining', 'not_joining']).notNullable().defaultTo('undecided');
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('demos');
};
