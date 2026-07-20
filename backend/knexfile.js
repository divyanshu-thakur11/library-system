require('dotenv').config();
const config = require('./src/config');

module.exports = {
  client: 'pg',
  connection: {
    ...config.db,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './src/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/seeds',
  },
};
