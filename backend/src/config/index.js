require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * DATABASE_URL is a URL, so any special character in the password
 * (@ : / ? # % &) MUST be percent-encoded or `pg` will silently parse the
 * wrong (often empty/undefined) password out of it - which surfaces as a
 * confusing "SASL: client password must be a string" error at login time
 * instead of a clear config error at startup.
 *
 * To avoid that trap entirely, you can instead set discrete PGHOST /
 * PGPORT / PGUSER / PGPASSWORD / PGDATABASE vars and leave DATABASE_URL
 * unset - no encoding needed.
 */
function resolveDbConnection() {
  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: required('PGUSER'),
      password: required('PGPASSWORD'),
      database: required('PGDATABASE'),
    };
  }

  const connectionString = required('DATABASE_URL');
  try {
    const parsed = new URL(connectionString);
    if (!parsed.password) {
      throw new Error(
        'DATABASE_URL has no password (or it failed to parse). If your password contains ' +
          'characters like @ : / ? # % &, they must be percent-encoded - see backend README.'
      );
    }
  } catch (err) {
    throw new Error(`DATABASE_URL is not a valid connection string: ${err.message}`);
  }
  return { connectionString };
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  db: {
    ...resolveDbConnection(),
    ssl: process.env.DATABASE_SSL === 'true',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
  },
};
