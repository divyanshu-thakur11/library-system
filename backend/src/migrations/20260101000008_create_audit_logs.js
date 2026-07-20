exports.up = function (knex) {
  return knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('user_name'); // denormalized snapshot, survives user deletion
    table.string('user_role');
    table.string('action_type').notNullable(); // e.g. MEMBER_CREATED, CABIN_ASSIGNED, SPECIAL_CASE_ASSIGNED
    table.string('entity_type').notNullable(); // e.g. member, cabin_assignment, bill
    table.string('entity_id');
    table.jsonb('before_state');
    table.jsonb('after_state');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['entity_type', 'entity_id']);
    table.index(['action_type']);
    table.index(['created_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};
