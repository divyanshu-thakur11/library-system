const knex = require('knex');
const config = require('../config');

const db = knex({
  client: 'pg',
  connection: {
    ...config.db,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
});

module.exports = db;
