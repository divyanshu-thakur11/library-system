const db = require('../db');
const { logAudit } = require('../middleware/audit');

async function getSettings(req, res, next) {
  try {
    const rows = await db('system_settings').select('*');
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const updates = req.body; // { key: value, ... }
    const before = await db('system_settings').select('*');
    const beforeMap = Object.fromEntries(before.map((r) => [r.key, r.value]));

    await db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(updates)) {
        await trx('system_settings')
          .insert({ key, value: String(value), updated_at: trx.fn.now() })
          .onConflict('key')
          .merge();
      }
    });

    const after = await db('system_settings').select('*');
    const afterMap = Object.fromEntries(after.map((r) => [r.key, r.value]));

    await logAudit({
      user: req.user,
      actionType: 'SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: 'global',
      before: beforeMap,
      after: afterMap,
    });

    res.json({ settings: afterMap });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
