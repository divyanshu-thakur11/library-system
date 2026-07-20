exports.up = function (knex) {
  return knex.schema.createTable('cabins', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('cabin_number').notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.text('notes');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('cabins');
};
