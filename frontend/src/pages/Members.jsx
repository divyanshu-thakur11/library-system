import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { normalizeIndianMobile, isValidIndianMobile, toWhatsAppNumber } from '../utils/phone';
import { formatDate, toLocalDateInput } from '../utils/date';
import { compressImage } from '../utils/imageCompress';
import { titleCaseOnType } from '../utils/text';

function defaultRegYear() {
  const yy = new Date().getFullYear() % 100;
  return `${String(yy).padStart(2, '0')}-${String(yy + 1).padStart(2, '0')}`;
}

const emptyDetails = { name: '', father_name: '', contact: '', address: '', photo_data: '', date_of_birth: '', registration_date: '' };

// Optional photo -> resized, compressed JPEG data URL. Resizing to a
// sensible avatar size before storing keeps each member's photo to roughly
// 20-80KB instead of multiple MB straight off a phone camera - the
// difference between fitting ~250 photographed members or 5,000+ in a
// free-tier database's storage cap.
async function readPhotoFile(file, onDone, onError) {
  if (!file) return;
  if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
    onError('Please choose a PNG, JPEG or WEBP image.');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    onError('Image is too large - please choose one under 15MB.');
    return;
  }
  try {
    const compressed = await compressImage(file);
    onDone(compressed);
  } catch (err) {
    onError(err.message);
  }
}

export default function Members() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('active'); // 'active' | 'vacated'

  const [showForm, setShowForm] = useState(false);
  const [justRegistered, setJustRegistered] = useState(null);
  const [regYear, setRegYear] = useState(defaultRegYear());
  const [editingYear, setEditingYear] = useState(false);
  const [regNumber, setRegNumber] = useState('');
  const [editingSerial, setEditingSerial] = useState(false);
  const [details, setDetails] = useState({ ...emptyDetails, registration_date: toLocalDateInput() });
  const [contactError, setContactError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editContactError, setEditContactError] = useState('');

  async function load() {
    const data = await api.get('/members', { search, status: tab === 'vacated' ? 'inactive' : 'active' }).catch((e) => {
      setError(e.message);
      return { members: [] };
    });
    setMembers(data.members);
  }

  const [prospects, setProspects] = useState([]);
  const [prospectSearch, setProspectSearch] = useState('');

  async function loadNextSerial() {
    const res = await api.get('/members/next-serial').catch(() => null);
    if (res) setRegNumber(String(res.next_serial));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab]);

  useEffect(() => {
    loadNextSerial();
  }, []);

  const [duplicateMatches, setDuplicateMatches] = useState([]);

  // Debounced check for existing members with a similar name, so staff
  // notice before creating an accidental duplicate rather than after.
  useEffect(() => {
    if (!showForm || details.name.trim().length < 3) {
      setDuplicateMatches([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get('/members', { search: details.name.trim() })
        .then((d) => setDuplicateMatches(d.members || []))
        .catch(() => setDuplicateMatches([]));
    }, 400);
    return () => clearTimeout(handle);
  }, [details.name, showForm]);

  useEffect(() => {
    Promise.all([
      api.get('/enquiries').catch(() => ({ enquiries: [] })),
      api.get('/demos').catch(() => ({ demos: [] })),
    ]).then(([e, d]) => {
      setProspects([
        ...(e.enquiries || []).map((p) => ({ ...p, source: 'Enquiry' })),
        ...(d.demos || []).map((p) => ({ ...p, source: 'Demo' })),
      ]);
    });
  }, []);

  function applyProspect(id) {
    const p = prospects.find((x) => `${x.source}:${x.id}` === id);
    if (!p) return;
    setDetails((d) => ({
      ...d,
      name: p.name,
      father_name: p.father_name || d.father_name,
      contact: p.contact || d.contact,
      address: p.address || d.address,
    }));
  }

  // Coming from an Enquiry/Demo row's "Add as Member" button - open the
  // create form and pull that prospect's details in automatically, once
  // the prospects list itself has finished loading.
  useEffect(() => {
    if (prospects.length === 0) return;
    const pending = sessionStorage.getItem('prefillProspect');
    if (!pending) return;
    sessionStorage.removeItem('prefillProspect');
    setShowForm(true);
    applyProspect(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects]);

  const memberCode = `SA-${regYear}-${regNumber}`;

  function resetCreateForm() {
    setRegYear(defaultRegYear());
    setEditingYear(false);
    setEditingSerial(false);
    setDetails({ ...emptyDetails, registration_date: toLocalDateInput() });
    setContactError('');
    loadNextSerial();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setContactError('');
    if (!isValidIndianMobile(details.contact)) {
      setContactError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
      return;
    }
    if (!regNumber) {
      setError('Enter the member number to complete the Member ID.');
      return;
    }
    try {
      const res = await api.post('/members', { ...details, member_code: memberCode });
      setJustRegistered(res.member);
      resetCreateForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function goToRenewal(m) {
    sessionStorage.setItem('renewalPrefillMember', m.id);
    navigate('/renewal');
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditForm({
      name: m.name,
      father_name: m.father_name || '',
      contact: m.contact,
      address: m.address || '',
      photo_data: m.photo_data || '',
      date_of_birth: m.date_of_birth ? m.date_of_birth.slice(0, 10) : '',
      status: m.status,
    });
    setEditContactError('');
  }

  async function saveEdit(id) {
    setEditContactError('');
    if (editForm.contact && !isValidIndianMobile(editForm.contact)) {
      setEditContactError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
      return;
    }
    setError('');
    try {
      await api.patch(`/members/${id}`, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestore(m) {
    if (!confirm(`Restore ${m.name} (${m.member_code}) to active? They'll reappear in normal Members/Billing/Cabins lists. You'll still need to assign them a cabin again if needed.`)) return;
    setError('');
    try {
      await api.patch(`/members/${m.id}`, { status: 'active' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVacate(m) {
    if (
      !confirm(
        `Vacate ${m.name}'s cabin assignment(s) and mark them inactive?\n\nThis frees up their cabin/time slots and removes them from Overdue/Expiring Soon lists, since they're being treated as having left. Their records, bills and receipts are kept - this doesn't delete anything. You can reactivate them from here later by editing their status back to active.`
      )
    )
      return;
    setError('');
    try {
      const res = await api.post(`/assignments/vacate/${m.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(m) {
    if (
      !confirm(
        `Permanently delete ${m.name} (${m.member_code})?\n\nThis will ALSO permanently delete all of their bills, receipts, cabin assignment history, and dues follow-ups. This cannot be undone.\n\nIf you just want to stop billing them but keep their history, use Edit → Status → inactive instead.`
      )
    )
      return;
    setError('');
    try {
      await api.del(`/members/${m.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Members</div>
          <h1>Member Register</h1>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Member'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {justRegistered && (
        <div
          className="card"
          style={{ background: 'var(--amber-soft, #f6ecd8)', border: '1px solid var(--brass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}
        >
          <div>
            ✅ <strong>{justRegistered.name}</strong> ({justRegistered.member_code}) registered successfully!
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {justRegistered.contact ? (
              <a
                className="btn"
                href={`https://wa.me/${toWhatsAppNumber(justRegistered.contact)}?text=${encodeURIComponent(
                  `Welcome to Shiv Shakti Library, ${justRegistered.name}! We're delighted to have you join us. 📚`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Send Welcome Message on WhatsApp
              </a>
            ) : (
              <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>No contact on file</span>
            )}
            <button className="btn secondary" onClick={() => setJustRegistered(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          {prospects.length > 0 && (
            <div className="field">
              <label>Load details from Enquiry / Demo (optional)</label>
              <input
                placeholder="Search by name to filter the list below…"
                value={prospectSearch}
                onChange={(e) => setProspectSearch(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <select defaultValue="" onChange={(e) => e.target.value && applyProspect(e.target.value)}>
                <option value="">— none, enter fresh —</option>
                {prospects
                  .filter((p) => p.name.toLowerCase().includes(prospectSearch.trim().toLowerCase()))
                  .map((p) => (
                    <option key={`${p.source}:${p.id}`} value={`${p.source}:${p.id}`}>
                      [{p.source}] {p.name} {p.contact ? `— ${p.contact}` : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Member ID</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}>
              <span>SA-</span>
              {editingYear ? (
                <input
                  style={{ width: 80 }}
                  value={regYear}
                  onChange={(e) => setRegYear(e.target.value)}
                  onBlur={() => setEditingYear(false)}
                  autoFocus
                />
              ) : (
                <span
                  onClick={() => setEditingYear(true)}
                  title="Click to change the year"
                  style={{ cursor: 'pointer', borderBottom: '1px dashed var(--brass)' }}
                >
                  {regYear}
                </span>
              )}
              <span>-</span>
              {editingSerial ? (
                <input
                  style={{ width: 90 }}
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setEditingSerial(false)}
                  autoFocus
                />
              ) : (
                <span
                  onClick={() => setEditingSerial(true)}
                  title="Click to change the serial number"
                  style={{ cursor: 'pointer', borderBottom: '1px dashed var(--brass)' }}
                >
                  {regNumber || '…'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 4 }}>
              Full ID: <strong>{memberCode}</strong> — auto-filled with the next serial number; click either part to change it
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Name</label>
              <input value={details.name} onChange={(e) => setDetails({ ...details, name: titleCaseOnType(e.target.value) })} required />
              {duplicateMatches.length > 0 && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                  ⚠ Possible existing member{duplicateMatches.length > 1 ? 's' : ''} with a similar name:
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {duplicateMatches.map((m) => (
                      <li key={m.id}>{m.member_code} — {m.name} ({m.contact}) — {m.status}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="field">
              <label>Father's Name</label>
              <input value={details.father_name} onChange={(e) => setDetails({ ...details, father_name: titleCaseOnType(e.target.value) })} />
            </div>
            <div className="field">
              <label>Contact (10-digit mobile)</label>
              <input
                value={details.contact}
                onChange={(e) => setDetails({ ...details, contact: normalizeIndianMobile(e.target.value) })}
                placeholder="98XXXXXXXX"
                maxLength={10}
                required
              />
              {contactError && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{contactError}</div>}
            </div>
            <div className="field">
              <label>Date of Birth (optional)</label>
              <input type="date" value={details.date_of_birth} onChange={(e) => setDetails({ ...details, date_of_birth: e.target.value })} />
            </div>
            <div className="field">
              <label>Registration Date</label>
              <input type="date" value={details.registration_date} onChange={(e) => setDetails({ ...details, registration_date: e.target.value })} required />
            </div>
            <div className="field">
              <label>Photo (optional)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  readPhotoFile(
                    e.target.files?.[0],
                    (dataUrl) => setDetails((d) => ({ ...d, photo_data: dataUrl })),
                    (msg) => setError(msg)
                  )
                }
              />
              {details.photo_data && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <img src={details.photo_data} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '50%' }} />
                  <button type="button" className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setDetails((d) => ({ ...d, photo_data: '' }))}>
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Address</label>
              <textarea value={details.address} onChange={(e) => setDetails({ ...details, address: titleCaseOnType(e.target.value) })} />
            </div>
          </div>
          <button className="btn" type="submit">Save Member</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            className={tab === 'active' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('active')}
          >
            Active Members
          </button>
          <button
            className={tab === 'vacated' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('vacated')}
          >
            Vacated Members
          </button>
        </div>
        {tab === 'vacated' && (
          <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginBottom: 12 }}>
            Members marked inactive via "Vacate" - their records, bills and receipts are kept. Restore anyone here to bring them back into normal use.
          </div>
        )}
        <div className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
          <input placeholder="Search by name, ID or contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th></th><th>Member ID</th><th>Name</th><th>Contact</th><th>Payment Date</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              editingId === m.id ? (
                <tr key={m.id}>
                  <td colSpan={7}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Name</label>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: titleCaseOnType(e.target.value) })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Contact</label>
                        <input maxLength={10} value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: normalizeIndianMobile(e.target.value) })} />
                        {editContactError && <div style={{ color: 'var(--red)', fontSize: '0.72rem' }}>{editContactError}</div>}
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Date of Birth</label>
                        <input type="date" value={editForm.date_of_birth} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Status</label>
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Address</label>
                        <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: titleCaseOnType(e.target.value) })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Photo</label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) =>
                            readPhotoFile(
                              e.target.files?.[0],
                              (dataUrl) => setEditForm((f) => ({ ...f, photo_data: dataUrl })),
                              (msg) => setError(msg)
                            )
                          }
                        />
                        {editForm.photo_data && (
                          <img src={editForm.photo_data} alt="preview" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%', marginTop: 4 }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => saveEdit(m.id)}>Save</button>
                        <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.id}>
                  <td>
                    {m.photo_data ? (
                      <img src={m.photo_data} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--paper-2, #eee)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                        {m.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </td>
                  <td>{m.member_code}</td>
                  <td>{m.name}</td>
                  <td>{m.contact}</td>
                  <td>{m.last_payment_date ? formatDate(m.last_payment_date) : <span style={{ color: 'var(--ink-soft)' }}>No payment yet</span>}</td>
                  <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => startEdit(m)}>Edit</button>
                    {tab === 'vacated' ? (
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--green-700)' }} onClick={() => handleRestore(m)}>Restore</button>
                    ) : (
                      <>
                        <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => goToRenewal(m)}>Renewal</button>
                        <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => handleVacate(m)}>Vacate</button>
                      </>
                    )}
                    {user?.role === 'admin' && (
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--red)' }} onClick={() => handleDelete(m)}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            ))}
            {members.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>{tab === 'vacated' ? 'No vacated members.' : 'No members yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}