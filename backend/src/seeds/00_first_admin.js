const bcrypt = require('bcryptjs');

/**
 * Creates the very first admin account, since every other user must be
 * created by an admin through the authenticated API. Reads from env vars
 * so no password is ever committed to source control.
 *
 * Set FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD / FIRST_ADMIN_NAME before
 * running `npm run seed`, or edit the fallback below for local dev only.
 */
exports.seed = async function (knex) {
  const email = (process.env.FIRST_ADMIN_EMAIL || 'admin@library.local').toLowerCase();
  const password = process.env.FIRST_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.FIRST_ADMIN_NAME || 'Library Admin';

  const existing = await knex('users').where({ email }).first();
  if (existing) return;

  const password_hash = await bcrypt.hash(password, 12);
  await knex('users').insert({ name, email, password_hash, role: 'admin', status: 'active' });

  console.log(`Seeded first admin: ${email} (change the password after first login)`);
};
