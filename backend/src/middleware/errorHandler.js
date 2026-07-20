// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  // Postgres exclusion_violation - only the cabin-overlap constraint uses this.
  if (err.code === '23P01') {
    return res.status(409).json({
      error: 'This cabin and time range overlaps with an existing assignment. Enable Special Case Assignment to override.',
    });
  }

  // Postgres unique_violation - message depends on WHICH constraint fired,
  // not just that "something" collided. Names confirmed against the real
  // schema (see migrations); fee_structures' name is Postgres-truncated to
  // 63 chars, hence the odd ending.
  if (err.code === '23505') {
    const messages = {
      users_email_unique: 'That email is already registered to another account.',
      cabins_cabin_number_unique: 'A cabin with that number already exists.',
      members_member_code_unique: 'That Member ID is already in use - pick a different number.',
      bills_bill_number_unique: 'That bill number was just used by another request - please try again.',
      receipts_receipt_number_unique: 'That receipt number was just used by another request - please try again.',
      time_slots_cabin_id_start_time_end_time_unique: 'That exact time range already exists for this cabin.',
      fee_structures_package_type_duration_months_hours_per_day_uniqu: 'A fee structure with this package, duration and hours combination already exists.',
    };
    return res.status(409).json({
      error: messages[err.constraint] || 'This conflicts with an existing record.',
    });
  }

  // Postgres undefined_table / undefined_column - almost always means a
  // migration hasn't been run yet against this database. This was
  // previously falling through to the generic handler below and leaking
  // the raw SQL query to the user as a confusing "Something went wrong
  // (insert into ... - relation does not exist)" message.
  if (err.code === '42P01' || err.code === '42703') {
    return res.status(500).json({
      error:
        'A required database table or column is missing. Run the latest migrations (`npm run migrate` in backend/, against the database this server is connected to) and try again.',
    });
  }

  const status = err.status || 500;
  const body = { error: err.publicMessage || 'Something went wrong' };
  // Raw error detail (e.g. the underlying SQL) is only ever shown when
  // explicitly opted into via DEBUG_ERRORS=true - NOT tied to NODE_ENV,
  // since it's easy to forget to set NODE_ENV=production on a host like
  // Render and otherwise end up leaking raw SQL to real users by default.
  if (process.env.DEBUG_ERRORS === 'true') {
    body.detail = err.message;
  }
  res.status(status).json(body);
}

class AppError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

module.exports = { errorHandler, AppError };
