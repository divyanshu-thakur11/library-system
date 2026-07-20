exports.up = async function (knex) {
  // btree_gist lets a GiST exclusion constraint compare plain equality
  // (cabin_id) alongside a range overlap (&&) in the same constraint.
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');

  // Postgres has no built-in range type over `time`, so we define one.
  // (Using text->timestamp casting instead was tried and rejected by
  // Postgres: "functions in index expression must be marked IMMUTABLE" -
  // text-to-timestamp parsing depends on the session's DateStyle setting,
  // so it's STABLE, not IMMUTABLE, and can't be used in an index/constraint.
  // A range built directly from `time` values has no such problem.)
  await knex.raw('CREATE TYPE timerange AS RANGE (subtype = time)');

  await knex.schema.alterTable('cabin_assignments', (table) => {
    table.time('start_time');
    table.time('end_time');
  });

  // Backfill from the linked time_slot (safe no-op on a brand new install).
  await knex.raw(`
    UPDATE cabin_assignments ca
    SET start_time = ts.start_time, end_time = ts.end_time
    FROM time_slots ts
    WHERE ts.id = ca.time_slot_id
  `);

  await knex.raw('ALTER TABLE cabin_assignments ALTER COLUMN start_time SET NOT NULL');
  await knex.raw('ALTER TABLE cabin_assignments ALTER COLUMN end_time SET NOT NULL');

  // The real fix (spec: cabin+time already taken by a NORMAL assignment
  // must block a second NORMAL assignment for any overlapping time range,
  // not just an identical one) - enforced at the database level.
  await knex.raw(`
    ALTER TABLE cabin_assignments
    ADD CONSTRAINT cabin_assignments_no_overlap
    EXCLUDE USING gist (
      cabin_id WITH =,
      timerange(start_time, end_time) WITH &&
    )
    WHERE (is_special_case = false AND status = 'active')
  `);

  // The old exact-match-only index is superseded by the constraint above.
  await knex.raw('DROP INDEX IF EXISTS cabin_assignments_normal_unique');
};

exports.down = async function (knex) {
  await knex.raw('ALTER TABLE cabin_assignments DROP CONSTRAINT IF EXISTS cabin_assignments_no_overlap');
  await knex.raw(`
    CREATE UNIQUE INDEX cabin_assignments_normal_unique
    ON cabin_assignments (cabin_id, time_slot_id)
    WHERE is_special_case = false AND status = 'active'
  `);
  await knex.schema.alterTable('cabin_assignments', (table) => {
    table.dropColumn('start_time');
    table.dropColumn('end_time');
  });
  await knex.raw('DROP TYPE IF EXISTS timerange');
};
