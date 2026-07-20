const db = require('../db');

async function listAuditLogs(req, res, next) {
  try {
    const { entity_type, action_type, from, to, page = 1, page_size = 50 } = req.query;

    const applyFilters = (qb) => {
      if (entity_type) qb.where({ entity_type });
      if (action_type) qb.where({ action_type });
      if (from) qb.where('created_at', '>=', from);
      if (to) qb.where('created_at', '<=', to);
    };

    const offset = (Number(page) - 1) * Number(page_size);

    const logs = await db('audit_logs')
      .select('*')
      .modify(applyFilters)
      .orderBy('created_at', 'desc')
      .limit(Number(page_size))
      .offset(offset);

    // Separate, unrelated query builder - does NOT carry the select('*')
    // from above, which is what was causing "column must appear in GROUP BY".
    const [{ count }] = await db('audit_logs').modify(applyFilters).count('id as count');

    res.json({ logs, total: Number(count), page: Number(page), page_size: Number(page_size) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };
