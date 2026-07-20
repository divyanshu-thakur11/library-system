exports.up = async function (knex) {
  await knex.schema.alterTable('bills', (table) => {
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable('receipts', (table) => {
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('bills', (table) => {
    table.dropColumn('updated_at');
  });
  await knex.schema.alterTable('receipts', (table) => {
    table.dropColumn('updated_at');
  });
};