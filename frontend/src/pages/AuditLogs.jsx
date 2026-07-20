import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDateTime } from '../utils/date';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/audit-logs').then((d) => setLogs(d.logs)).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Admin Only</div>
          <h1>Audit Logs</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th></th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <Fragment key={log.id}>
                <tr>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.user_name} <span style={{ color: 'var(--ink-soft)' }}>({log.user_role})</span></td>
                  <td><span className="badge active">{log.action_type}</span></td>
                  <td>{log.entity_type} <span style={{ color: 'var(--ink-soft)' }}>{log.entity_id?.slice(0, 8)}</span></td>
                  <td>
                    <button
                      className="btn secondary"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      {expanded === log.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expanded === log.id && (
                  <tr>
                    <td colSpan={5}>
                      <div style={{ display: 'flex', gap: 20, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                        <div>
                          <strong>Before</strong>
                          <pre>{JSON.stringify(log.before_state, null, 2) || '—'}</pre>
                        </div>
                        <div>
                          <strong>After</strong>
                          <pre>{JSON.stringify(log.after_state, null, 2) || '—'}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
