// Enquiries are prospective members - NOT real members yet. Deliberately a
// separate table (not `members`) so they never show up in the Members tab
// until someone actually converts them via cabin assignment + a receipt.
exports.up = function (knex) {
  return knex.schema.createTable('enquiries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('contact');
    table.text('address');
    table.text('notes'); // general details discussed - interest, timing, budget, etc.
    table.date('enquiry_date').notNullable().defaultTo(knex.fn.now());
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
  return knex.schema.dropTableIfExists('enquiries');
};
