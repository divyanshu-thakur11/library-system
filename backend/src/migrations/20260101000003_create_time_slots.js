exports.up = function (knex) {
  return knex.schema.createTable('time_slots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('cabin_id')
      .notNullable()
      .references('id')
      .inTable('cabins')
      .onDelete('CASCADE');
    table.string('label').notNullable(); // e.g. "Morning", "Evening"
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['cabin_id', 'start_time', 'end_time']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('time_slots');
};
