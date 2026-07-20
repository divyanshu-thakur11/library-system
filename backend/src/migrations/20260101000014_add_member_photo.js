// Adds an optional member photograph, stored as a base64 data URL so the
// stateless "no local file storage" design (see app.js) still holds - the
// photo lives in the DB row itself, no filesystem/S3 dependency needed.
exports.up = function (knex) {
  return knex.schema.alterTable('members', (table) => {
    table.text('photo_data');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('members', (table) => {
    table.dropColumn('photo_data');
  });
};
