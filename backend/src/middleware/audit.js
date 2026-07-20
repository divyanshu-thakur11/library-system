const db = require('../db');

/**
 * Writes one audit log row. Called directly from controllers (rather than
 * as generic route middleware) because only the controller knows the
 * real before/after state of the entity it just changed - a generic
 * request/response logger can only see request bodies, not DB state.
 *
 * @param {object} params
 * @param {object} params.user - req.user (from JWT, never trust client input)
 * @param {string} params.actionType - e.g. 'MEMBER_CREATED', 'SPECIAL_CASE_ASSIGNED'
 * @param {string} params.entityType - e.g. 'member', 'cabin_assignment'
 * @param {string} params.entityId
 * @param {object|null} params.before
 * @param {object|null} params.after
 * @param {import('knex').Knex.Transaction} [trx]
 */
async function logAudit({ user, actionType, entityType, entityId, before = null, after = null }, trx) {
  const runner = trx || db;
  await runner('audit_logs').insert({
    user_id: user?.id || null,
    user_name: user?.name || 'system',
    user_role: user?.role || 'system',
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    before_state: before ? JSON.stringify(before) : null,
    after_state: after ? JSON.stringify(after) : null,
  });
}

module.exports = { logAudit };
