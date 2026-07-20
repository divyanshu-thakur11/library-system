exports.up = async function (knex) {
  await knex.schema.createTable('cabin_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('member_id')
      .notNullable()
      .references('id')
      .inTable('members')
      .onDelete('CASCADE');
    table
      .uuid('cabin_id')
      .notNullable()
      .references('id')
      .inTable('cabins')
      .onDelete('RESTRICT');
    table
      .uuid('time_slot_id')
      .notNullable()
      .references('id')
      .inTable('time_slots')
      .onDelete('RESTRICT');
    table.boolean('is_special_case').notNullable().defaultTo(false);
    table.text('special_case_reason');
    table.enu('status', ['active', 'ended']).notNullable().defaultTo('active');
    table
      .uuid('assigned_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ended_at');

    table.index(['cabin_id', 'time_slot_id']);
    table.index(['member_id']);
  });

  // Enforce "one normal member per cabin+slot" at the database level, but
  // ONLY for active, non-special-case rows. Special-case assignments are
  // exempt by design, and this index cannot block them. This gives us a
  // hard guarantee that normal-mode double-booking is impossible even if
  // application logic has a bug, while special cases stay unrestricted.
  await knex.raw(`
    CREATE UNIQUE INDEX cabin_assignments_normal_unique
    ON cabin_assignments (cabin_id, time_slot_id)
    WHERE is_special_case = false AND status = 'active'
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS cabin_assignments_normal_unique');
  await knex.schema.dropTableIfExists('cabin_assignments');
};
