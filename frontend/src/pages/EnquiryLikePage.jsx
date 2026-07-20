import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { normalizeIndianMobile, isValidIndianMobile } from '../utils/phone';
import { formatDate, toLocalDateInput } from '../utils/date';

const emptyForm = {
  name: '',
  father_name: '',
  contact: '',
  address: '',
  notes: '',
  enquiry_date: toLocalDateInput(),
  follow_up_date: '',
  expected_payment_date: '',
  joining_status: 'undecided',
};

function StatusBadge({ status }) {
  const colors = {
    undecided: { bg: '#ece9dc', color: 'var(--ink-soft)' },
    joining: { bg: '#e2ede6', color: 'var(--green-700)' },
    not_joining: { bg: '#f6dede', color: 'var(--red)' },
  };
  const style = colors[status] || colors.undecided;
  const label = status === 'not_joining' ? 'Not Joining' : status === 'joining' ? 'Joining' : 'Undecided';
  return <span className="badge" style={{ background: style.bg, color: style.color }}>{label}</span>;
}

function isOverdue(row) {
  if (!row.follow_up_date || row.joining_status !== 'undecided') return false;
  return new Date(row.follow_up_date) < new Date(new Date().toDateString());
}

// Shared between Enquiry and Demo pages - same shape, different labels.
//
// Two optional props make this component do double duty for Demo:
//  - showExpectedPayment: adds an optional "expected payment date" field
//  - pullApiPath/pullEntityKey/pullSourceLabel: when set (only for Demo),
//    shows a searchable "load details from Enquiry" picker in the create
//    form, so a Demo entry can be started from an existing Enquiry without
//    retyping their details.
export default function EnquiryLikePage({
  title,
  eyebrow,
  dateField,
  dateLabel,
  apiPath,
  entityKey,
  prospectSource,
  showExpectedPayment = false,
  pullApiPath,
  pullEntityKey,
  pullSourceLabel,
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [contactError, setContactError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, [dateField]: emptyForm.enquiry_date });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editContactError, setEditContactError] = useState('');

  const [pullOptions, setPullOptions] = useState([]);
  const [pullSearch, setPullSearch] = useState('');

  async function load() {
    const params = { search };
    if (statusFilter) params.joining_status = statusFilter;
    const data = await api.get(apiPath, params).catch((e) => {
      setError(e.message);
      return { [entityKey]: [] };
    });
    setRows(data[entityKey] || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  // Only fires for Demo, since only Demo passes pullApiPath.
  useEffect(() => {
    if (!pullApiPath) return;
    api.get(pullApiPath).then((d) => setPullOptions(d[pullEntityKey] || [])).catch(() => setPullOptions([]));
  }, [pullApiPath, pullEntityKey]);

  function applyPullOption(id) {
    const p = pullOptions.find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({
      ...f,
      name: p.name,
      father_name: p.father_name || f.father_name,
      contact: p.contact || f.contact,
      address: p.address || f.address,
    }));
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const joining = rows.filter((r) => r.joining_status === 'joining').length;
    const notJoining = rows.filter((r) => r.joining_status === 'not_joining').length;
    const undecided = rows.filter((r) => r.joining_status === 'undecided').length;
    const overdue = rows.filter(isOverdue).length;
    return { total, joining, notJoining, undecided, overdue };
  }, [rows]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setContactError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!isValidIndianMobile(form.contact)) {
      setContactError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
      return;
    }
    try {
      await api.post(apiPath, form);
      setForm({ ...emptyForm, [dateField]: emptyForm.enquiry_date });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditContactError('');
    setEditForm({
      name: row.name,
      father_name: row.father_name || '',
      contact: row.contact || '',
      address: row.address || '',
      notes: row.notes || '',
      [dateField]: row[dateField] ? row[dateField].slice(0, 10) : '',
      follow_up_date: row.follow_up_date ? row.follow_up_date.slice(0, 10) : '',
      expected_payment_date: row.expected_payment_date ? row.expected_payment_date.slice(0, 10) : '',
      joining_status: row.joining_status,
    });
  }

  async function saveEdit(id) {
    setError('');
    setEditContactError('');
    if (!isValidIndianMobile(editForm.contact)) {
      setEditContactError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
      return;
    }
    try {
      await api.patch(`${apiPath}/${id}`, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete this ${eyebrow.toLowerCase()} entry for ${row.name}? This cannot be undone.`)) return;
    setError('');
    try {
      await api.del(`${apiPath}/${row.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function addAsMember(row) {
    sessionStorage.setItem('prefillProspect', `${prospectSource}:${row.id}`);
    navigate('/members');
  }

  const filteredPullOptions = pullOptions.filter((p) =>
    p.name.toLowerCase().includes(pullSearch.trim().toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : `+ Add ${eyebrow}`}
        </button>
      </div>

      <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginTop: -8, marginBottom: 16 }}>
        These are prospective members only — they will not appear in the Members tab. Once you assign them a
        cabin and record a receipt as an actual member, use "Add as Member" below to pull their details into
        the Members tab. Next follow-up scheduling happens later, from Dues &amp; Payments, once they're an
        actual member.
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
        <div className="stat-card">
          <div className="label">Total {eyebrow}s</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Joining</div>
          <div className="value" style={{ color: 'var(--green-700)' }}>{stats.joining}</div>
        </div>
        <div className="stat-card">
          <div className="label">Not Joining</div>
          <div className="value" style={{ color: 'var(--red)' }}>{stats.notJoining}</div>
        </div>
        <div className="stat-card">
          <div className="label">Undecided</div>
          <div className="value">{stats.undecided}</div>
        </div>
        <div className="stat-card">
          <div className="label">Overdue Follow-up</div>
          <div className="value" style={{ color: stats.overdue > 0 ? 'var(--red)' : 'inherit' }}>{stats.overdue}</div>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          {pullApiPath && pullOptions.length > 0 && (
            <div className="field">
              <label>Load details from {pullSourceLabel} (optional)</label>
              <input
                placeholder={`Search ${pullSourceLabel} by name to filter the list below…`}
                value={pullSearch}
                onChange={(e) => setPullSearch(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <select defaultValue="" onChange={(e) => e.target.value && applyPullOption(e.target.value)}>
                <option value="">— none, enter fresh —</option>
                {filteredPullOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.contact ? `— ${p.contact}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Father's Name</label>
              <input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Contact</label>
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: normalizeIndianMobile(e.target.value) })}
                placeholder="98XXXXXXXX"
                maxLength={10}
                required
              />
              {contactError && <div style={{ color: 'var(--red)', fontSize: '0.72rem' }}>{contactError}</div>}
            </div>
            <div className="field">
              <label>{dateLabel}</label>
              <input type="date" value={form[dateField]} onChange={(e) => setForm({ ...form, [dateField]: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Address</label>
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>General Details / Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Interested hours, budget, timing preference, how they heard about us, etc."
              />
            </div>
            <div className="field">
              <label>Joining?</label>
              <select value={form.joining_status} onChange={(e) => setForm({ ...form, joining_status: e.target.value })}>
                <option value="undecided">Undecided</option>
                <option value="joining">Joining</option>
                <option value="not_joining">Not Joining</option>
              </select>
            </div>
            <div className="field">
              <label>Tentative Follow-up Date</label>
              <input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
            </div>
            {showExpectedPayment && (
              <div className="field">
                <label>Expected Payment Date (optional)</label>
                <input
                  type="date"
                  value={form.expected_payment_date}
                  onChange={(e) => setForm({ ...form, expected_payment_date: e.target.value })}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                  When they've said they'll pay by — just for your own planning, not a commitment.
                </div>
              </div>
            )}
          </div>
          <button className="btn" type="submit">Save</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 320, marginBottom: 0 }}>
            <input placeholder="Search by name or contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="undecided">Undecided</option>
              <option value="joining">Joining</option>
              <option value="not_joining">Not Joining</option>
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Father's Name</th><th>Contact</th><th>{dateLabel}</th>
              <th>Follow-up</th>
              {showExpectedPayment && <th>Expected Payment</th>}
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editingId === row.id ? (
                <tr key={row.id}>
                  <td colSpan={showExpectedPayment ? 8 : 7}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Name</label>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Father's Name</label>
                        <input value={editForm.father_name} onChange={(e) => setEditForm({ ...editForm, father_name: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Contact</label>
                        <input maxLength={10} value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: normalizeIndianMobile(e.target.value) })} />
                        {editContactError && <div style={{ color: 'var(--red)', fontSize: '0.72rem' }}>{editContactError}</div>}
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>{dateLabel}</label>
                        <input type="date" value={editForm[dateField]} onChange={(e) => setEditForm({ ...editForm, [dateField]: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Follow-up</label>
                        <input type="date" value={editForm.follow_up_date} onChange={(e) => setEditForm({ ...editForm, follow_up_date: e.target.value })} />
                      </div>
                      {showExpectedPayment && (
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Expected Payment</label>
                          <input type="date" value={editForm.expected_payment_date} onChange={(e) => setEditForm({ ...editForm, expected_payment_date: e.target.value })} />
                        </div>
                      )}
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Joining?</label>
                        <select value={editForm.joining_status} onChange={(e) => setEditForm({ ...editForm, joining_status: e.target.value })}>
                          <option value="undecided">Undecided</option>
                          <option value="joining">Joining</option>
                          <option value="not_joining">Not Joining</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => saveEdit(row.id)}>Save</button>
                        <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} style={isOverdue(row) ? { background: 'var(--red-soft)' } : undefined}>
                  <td>
                    {row.name}
                    {isOverdue(row) && <span className="badge special" style={{ marginLeft: 6 }} title="Follow-up date has passed">Overdue</span>}
                  </td>
                  <td>{row.father_name || '—'}</td>
                  <td>{row.contact || '—'}</td>
                  <td>{formatDate(row[dateField])}</td>
                  <td>{formatDate(row.follow_up_date)}</td>
                  {showExpectedPayment && <td>{formatDate(row.expected_payment_date)}</td>}
                  <td><StatusBadge status={row.joining_status} /></td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => addAsMember(row)}>Add as Member</button>
                    <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => startEdit(row)}>Edit</button>
                    <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--red)' }} onClick={() => handleDelete(row)}>Delete</button>
                  </td>
                </tr>
              )
            )}
            {rows.length === 0 && (
              <tr><td colSpan={showExpectedPayment ? 8 : 7} style={{ color: 'var(--ink-soft)' }}>Nothing here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}