import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyForm = { package_type: 'Monthly', duration_months: 1, hours_per_day: 6, amount: '' };

export default function FeeStructures() {
  const { user } = useAuth();
  const [fees, setFees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const data = await api.get('/fee-structures', { include_inactive: 'true' }).catch((e) => { setError(e.message); return { fee_structures: [] }; });
    setFees(data.fee_structures);
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/fee-structures', form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(f) {
    setEditingId(f.id);
    setEditForm({ package_type: f.package_type, duration_months: f.duration_months, hours_per_day: f.hours_per_day, amount: f.amount });
  }

  async function saveEdit(id) {
    setError('');
    try {
      await api.patch(`/fee-structures/${id}`, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(f) {
    setError('');
    try {
      await api.patch(`/fee-structures/${f.id}`, { is_active: !f.is_active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(f) {
    if (
      !confirm(
        `Delete the "${f.package_type}" (${f.hours_per_day} hrs/day) fee structure permanently?\n\nThis does not affect any past bills already created with it (they keep their own recorded amount) - it just removes it from the list you pick from when generating new bills.`
      )
    )
      return;
    setError('');
    try {
      await api.del(`/fee-structures/${f.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const isOwner = user?.role === 'admin';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Billing</div>
          <h1>Fee Structures</h1>
        </div>
        {isOwner && (
          <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add Fee Structure'}</button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!isOwner && (
        <div className="checkbox-row" style={{ marginBottom: 18 }}>
          Only the Owner can add or edit fee structures. You can still use them when generating a bill.
        </div>
      )}

      {showForm && isOwner && (
        <form className="card" onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Package</label>
              <input value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} placeholder="Monthly, 2 Month…" required />
            </div>
            <div className="field">
              <label>Duration (months)</label>
              <input type="number" min="1" value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} required />
            </div>
            <div className="field">
              <label>Hours / Day</label>
              <input type="number" step="0.5" min="1" value={form.hours_per_day} onChange={(e) => setForm({ ...form, hours_per_day: e.target.value })} required />
            </div>
            <div className="field">
              <label>Fixed Fee (₹)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
          </div>
          <button className="btn" type="submit">Save</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Package</th><th>Duration</th><th>Hours/Day</th><th>Fixed Fee</th><th>Status</th>{isOwner && <th></th>}</tr></thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                {editingId === f.id ? (
                  <>
                    <td><input value={editForm.package_type} onChange={(e) => setEditForm({ ...editForm, package_type: e.target.value })} /></td>
                    <td><input type="number" min="1" value={editForm.duration_months} onChange={(e) => setEditForm({ ...editForm, duration_months: e.target.value })} /></td>
                    <td><input type="number" step="0.5" min="1" value={editForm.hours_per_day} onChange={(e) => setEditForm({ ...editForm, hours_per_day: e.target.value })} /></td>
                    <td><input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></td>
                    <td><span className={`badge ${f.is_active ? 'active' : 'inactive'}`}>{f.is_active ? 'active' : 'inactive'}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => saveEdit(f.id)}>Save</button>
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{f.package_type}</td>
                    <td>{f.duration_months} mo</td>
                    <td>{f.hours_per_day} hrs</td>
                    <td>₹{Number(f.amount).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${f.is_active ? 'active' : 'inactive'}`}>{f.is_active ? 'active' : 'inactive'}</span></td>
                    {isOwner && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => startEdit(f)}>Edit</button>
                        <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => toggleActive(f)}>
                          {f.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--red)' }} onClick={() => handleDelete(f)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {fees.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>No fee structures defined yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}