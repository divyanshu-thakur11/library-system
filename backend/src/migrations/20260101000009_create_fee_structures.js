exports.up = function (knex) {
  return knex.schema.createTable('fee_structures', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('package_type').notNullable(); // e.g. Monthly, 2 Month, 3 Month, 6 Month
    table.integer('duration_months').notNullable();
    table.decimal('hours_per_day', 4, 1).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // one price per (package, hours/day) combination
    table.unique(['package_type', 'duration_months', 'hours_per_day']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('fee_structures');
};
