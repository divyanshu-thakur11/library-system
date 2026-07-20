import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { toLocalDateInput } from '../utils/date';

function ChangeOwnPassword() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (form.new_password !== form.confirm) {
      setError('New password and confirmation do not match');
      return;
    }
    try {
      await api.patch('/users/me/password', form);
      setMsg('Password updated.');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Change My Password</h2>
      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="stat-card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Current Password</label>
          <input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required />
        </div>
        <div className="field">
          <label>New Password</label>
          <input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required minLength={8} />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required minLength={8} />
        </div>
      </div>
      <button className="btn" type="submit">Update Password</button>
    </form>
  );
}

function ManagerAccounts() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'manager' });
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [usernameTarget, setUsernameTarget] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api.get('/users').catch((e) => { setError(e.message); return { users: [] }; });
    setUsers(data.users);
  }
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'manager' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStatus(u) {
    setError('');
    try {
      await api.patch(`/users/${u.id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/users/${resetTarget.id}/password`, { new_password: resetPassword });
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitUsernameChange(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/users/${usernameTarget.id}/username`, { username: newUsername });
      setUsernameTarget(null);
      setNewUsername('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Owner &amp; Manager Accounts</h2>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={createUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 18 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Username</label>
          <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="manager">Manager</option>
            <option value="admin">Owner</option>
          </select>
        </div>
        <button className="btn" type="submit">Add</button>
      </form>

      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role === 'admin' ? 'Owner' : 'Manager'}</td>
              <td><span className={`badge ${u.status}`}>{u.status}</span></td>
              <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => { setUsernameTarget(u); setNewUsername(u.email); }}>
                  Change username
                </button>
                <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setResetTarget(u)}>
                  Reset password
                </button>
                <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => toggleStatus(u)}>
                  {u.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {usernameTarget && (
        <form onSubmit={submitUsernameChange} className="checkbox-row" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
          <span>New username for <strong>{usernameTarget.name}</strong> (can be an email or any plain text):</span>
          <input
            type="text"
            style={{ width: 220 }}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
          />
          <button className="btn" type="submit">Save</button>
          <button className="btn secondary" type="button" onClick={() => { setUsernameTarget(null); setNewUsername(''); }}>Cancel</button>
        </form>
      )}

      {resetTarget && (
        <form onSubmit={submitReset} className="checkbox-row" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
          <span>Set new password for <strong>{resetTarget.name}</strong>:</span>
          <input
            type="password"
            style={{ width: 200 }}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="btn" type="submit">Save</button>
          <button className="btn secondary" type="button" onClick={() => setResetTarget(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

function OperatingHours() {
  const [settings, setSettings] = useState({ operating_hours_start: '', operating_hours_end: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api.get('/settings').then((d) => setSettings(d.settings)); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.patch('/settings', settings);
      setMsg('Saved. New cabins/time slots will default to these hours.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Default Operating Hours</h2>
      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="stat-card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 340 }}>
        <div className="field">
          <label>Opens at</label>
          <input type="time" value={settings.operating_hours_start} onChange={(e) => setSettings({ ...settings, operating_hours_start: e.target.value })} />
        </div>
        <div className="field">
          <label>Closes at</label>
          <input type="time" value={settings.operating_hours_end} onChange={(e) => setSettings({ ...settings, operating_hours_end: e.target.value })} />
        </div>
      </div>
      <button className="btn" type="submit">Save Hours</button>
    </form>
  );
}

function BackupExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [pendingFile, setPendingFile] = useState(null);

  async function download() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/backup/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Backup export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `library-backup-${toLocalDateInput()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleFilePicked(e) {
    const file = e.target.files?.[0];
    setRestoreMsg('');
    setRestoreError('');
    if (!file) {
      setPendingFile(null);
      return;
    }
    if (!file.name.endsWith('.json')) {
      setRestoreError('Please choose the .json backup file you downloaded earlier.');
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
  }

  async function confirmRestore() {
    if (!pendingFile) return;
    if (
      !confirm(
        'This will REPLACE all current members, cabins, assignments, fee structures, bills and receipts with the contents of this backup file. This cannot be undone. Continue?'
      )
    ) {
      return;
    }
    setRestoreBusy(true);
    setRestoreError('');
    setRestoreMsg('');
    try {
      const text = await pendingFile.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON - is it the exact file downloaded from Backup export?');
      }
      const result = await api.post('/backup/import', parsed);
      const summary = Object.entries(result.restored || {})
        .map(([table, count]) => `${count} ${table.replace('_', ' ')}`)
        .join(', ');
      setRestoreMsg(`Restore complete: ${summary}. Refresh other tabs to see the restored data.`);
      setPendingFile(null);
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Backup</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginBottom: 14 }}>
        Downloads a full JSON export of members, cabins, assignments, fee structures, bills and receipts.
        Store the file somewhere safe (this is a manual export, not an automatic schedule).
      </p>
      {error && <div className="error-banner">{error}</div>}
      <button className="btn" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download Backup (.json)'}
      </button>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 16 }}>
        <h3 style={{ fontSize: '0.92rem', marginBottom: 6 }}>Restore from Backup</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginBottom: 12 }}>
          If you ever lose your data, upload the last <code>.json</code> backup file you downloaded here to
          restore it. <strong>This replaces all current data in these tables</strong> - only use this if you're
          recovering from data loss, not as a routine import.
        </p>
        {restoreError && <div className="error-banner">{restoreError}</div>}
        {restoreMsg && <div className="stat-card" style={{ marginBottom: 12, borderColor: 'var(--green-500)' }}>{restoreMsg}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept="application/json,.json" onChange={handleFilePicked} style={{ maxWidth: 280 }} />
          <button className="btn" onClick={confirmRestore} disabled={!pendingFile || restoreBusy}>
            {restoreBusy ? 'Restoring…' : 'Restore This Backup'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Settings</h1>
        </div>
      </div>

      <ChangeOwnPassword />
      {user?.role === 'admin' && <ManagerAccounts />}
      {user?.role === 'admin' && <OperatingHours />}
      {user?.role === 'admin' && <BackupExport />}
    </div>
  );
}