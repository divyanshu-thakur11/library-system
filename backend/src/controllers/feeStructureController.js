const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { AppError } = require('../middleware/errorHandler');

async function listFeeStructures(req, res, next) {
  try {
    let query = db('fee_structures').orderBy(['package_type', 'hours_per_day']);
    if (req.query.include_inactive !== 'true') {
      query = query.where({ is_active: true });
    }
    const rows = await query;
    res.json({ fee_structures: rows });
  } catch (err) {
    next(err);
  }
}

async function createFeeStructure(req, res, next) {
  try {
    const { package_type, duration_months, hours_per_day, amount } = req.body;
    if (!package_type || !duration_months || !hours_per_day || amount === undefined) {
      throw new AppError(400, 'package_type, duration_months, hours_per_day and amount are required');
    }

    const [row] = await db('fee_structures')
      .insert({ package_type, duration_months, hours_per_day, amount })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'FEE_STRUCTURE_CREATED',
      entityType: 'fee_structure',
      entityId: row.id,
      after: row,
    });

    res.status(201).json({ fee_structure: row });
  } catch (err) {
    next(err);
  }
}

async function updateFeeStructure(req, res, next) {
  try {
    const { id } = req.params;
    const before = await db('fee_structures').where({ id }).first();
    if (!before) throw new AppError(404, 'Fee structure not found');

    const allowed = ['amount', 'is_active', 'duration_months', 'hours_per_day', 'package_type'];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    updates.updated_at = db.fn.now();

    const [after] = await db('fee_structures').where({ id }).update(updates).returning('*');

    await logAudit({
      user: req.user,
      actionType: 'FEE_STRUCTURE_UPDATED',
      entityType: 'fee_structure',
      entityId: id,
      before,
      after,
    });

    res.json({ fee_structure: after });
  } catch (err) {
    next(err);
  }
}

async function deleteFeeStructure(req, res, next) {
  try {
    const { id } = req.params;
    const row = await db('fee_structures').where({ id }).first();
    if (!row) throw new AppError(404, 'Fee structure not found');

    await db('fee_structures').where({ id }).delete();

    await logAudit({
      user: req.user,
      actionType: 'FEE_STRUCTURE_DELETED',
      entityType: 'fee_structure',
      entityId: id,
      before: row,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure };