// Tracks follow-up state for members with dues (overdue / expiring soon /
// upcoming). Each row is one follow-up "touch" - the Dues page shows the
// most recent row per member as that member's current follow-up status.
exports.up = function (knex) {
  return knex.schema.createTable('dues_followups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('member_id')
      .notNullable()
      .references('id')
      .inTable('members')
      .onDelete('CASCADE');
    table.enu('category', ['overdue', 'expiring_soon', 'upcoming']).notNullable();
    table.text('reason');
    table.date('follow_up_date'); // when the member said they'd pay/respond
    table.date('next_follow_up_date'); // when staff should check in again
    table.enu('status', ['pending', 'paid', 'not_paid', 'vacated']).notNullable().defaultTo('pending');
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['member_id']);
    table.index(['status']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('dues_followups');
};
