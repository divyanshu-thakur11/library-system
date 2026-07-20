exports.up = async function (knex) {
  await knex.schema.createTable('system_settings', (table) => {
    table.string('key').primary();
    table.string('value').notNullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex('system_settings').insert([
    { key: 'operating_hours_start', value: '06:00' },
    { key: 'operating_hours_end', value: '23:00' },
  ]);
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('system_settings');
};
