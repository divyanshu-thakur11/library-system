const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { todayIST } = require('../utils/dateIST');
const { AppError } = require('../middleware/errorHandler');

const TABLES = [
  'members',
  'cabins',
  'time_slots',
  'cabin_assignments',
  'fee_structures',
  'bills',
  'receipts',
];

// Exports the operational tables (not users/passwords) as one JSON file the
// owner can download and store wherever they like. This is a manual,
// on-demand export rather than an automated cloud backup - wire it up to a
// scheduled job later if you want it to run unattended.
async function exportBackup(req, res, next) {
  try {
    const data = {};
    for (const table of TABLES) {
      data[table] = await db(table).select('*');
    }
    data._exported_at = new Date().toISOString();
    data._exported_by = req.user.name;

    await logAudit({
      user: req.user,
      actionType: 'BACKUP_EXPORTED',
      entityType: 'system',
      entityId: 'backup',
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-backup-${todayIST()}.json"`
    );
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
}

// Tables in parent-first order for inserting (respects foreign keys), and
// the reverse for deleting existing data first.
const RESTORE_ORDER = ['cabins', 'fee_structures', 'members', 'time_slots', 'cabin_assignments', 'bills', 'receipts'];

// Columns that reference `users(id)` across these tables. Since a restore
// might land in a database with different user accounts than the one the
// backup was taken from, any reference to a user that no longer exists is
// set to NULL rather than failing the whole restore (all these columns
// allow NULL - they're "who did this" attribution, not required data).
const USER_REF_COLUMNS = {
  members: ['created_by'],
  bills: ['created_by'],
  receipts: ['created_by'],
  cabin_assignments: ['assigned_by'],
};

// Restores from a JSON file previously produced by exportBackup. This is a
// full replace of the operational tables (not additive/merge) - it's meant
// for "I lost my data, restore the last good backup", not for partial
// imports. Existing data in these tables is deleted first.
async function importBackup(req, res, next) {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || !Array.isArray(data.members)) {
      throw new AppError(400, 'This does not look like a valid library backup file.');
    }
    for (const table of RESTORE_ORDER) {
      if (!Array.isArray(data[table])) {
        throw new AppError(400, `Backup file is missing or has an invalid "${table}" section.`);
      }
    }

    const existingUserIds = new Set((await db('users').select('id')).map((u) => u.id));

    let counts = {};
    await db.transaction(async (trx) => {
      // Delete children-first so foreign keys never block a delete.
      for (const table of [...RESTORE_ORDER].reverse()) {
        await trx(table).del();
      }
      // Insert parents-first, in reasonably sized batches (Postgres has a
      // parameter-count limit per statement, so don't insert 600+ rows in
      // one go if a table has many columns).
      for (const table of RESTORE_ORDER) {
        const rows = data[table];
        const refCols = USER_REF_COLUMNS[table] || [];
        const cleaned = rows.map((row) => {
          const copy = { ...row };
          for (const col of refCols) {
            if (copy[col] && !existingUserIds.has(copy[col])) copy[col] = null;
          }
          return copy;
        });
        counts[table] = cleaned.length;
        for (let i = 0; i < cleaned.length; i += 200) {
          const batch = cleaned.slice(i, i + 200);
          if (batch.length > 0) await trx(table).insert(batch);
        }
      }
    });

    await logAudit({
      user: req.user,
      actionType: 'BACKUP_RESTORED',
      entityType: 'system',
      entityId: 'backup',
      after: counts,
    });

    res.json({ ok: true, restored: counts });
  } catch (err) {
    next(err);
  }
}

module.exports = { exportBackup, importBackup };