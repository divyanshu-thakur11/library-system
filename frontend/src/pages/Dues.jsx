import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { toWhatsAppNumber } from '../utils/phone';
import { formatDate } from '../utils/date';
import { wasSentToday, markSentToday, clearSent } from '../utils/sentTracker';

function DateFilter({ from, to, onFrom, onTo, onClear }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>From</label>
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} style={{ width: 160 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>To</label>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} style={{ width: 160 }} />
      </div>
      <button className="btn secondary" onClick={onClear} style={{ padding: '8px 12px' }}>Clear</button>
    </div>
  );
}

function waLink(contact, text) {
  if (!contact) return null;
  return `https://wa.me/${toWhatsAppNumber(contact)}?text=${encodeURIComponent(text)}`;
}

// `sentKey` (e.g. `overdue:${memberId}`) enables once-per-day disabling:
// after the button is clicked once, it's replaced with a "Sent today"
// badge plus a small "Send Again" button to manually reactivate it if
// needed. Without a sentKey, it behaves as a plain always-active button.
function WhatsAppButton({ contact, text, sentKey }) {
  const [sentToday, setSentToday] = useState(() => (sentKey ? wasSentToday(sentKey) : false));
  const href = waLink(contact, text);
  if (!href) return <span style={{ color: 'var(--ink-soft)', fontSize: '0.72rem' }}>No contact</span>;

  function handleClick() {
    if (sentKey) {
      markSentToday(sentKey);
      setSentToday(true);
    }
  }

  function handleReactivate() {
    if (sentKey) {
      clearSent(sentKey);
      setSentToday(false);
    }
  }

  if (sentKey && sentToday) {
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <span className="badge" style={{ background: 'var(--green-soft, #e2ede6)', color: 'var(--green-700)' }}>
          Sent today
        </span>
        <button
          type="button"
          className="btn secondary"
          style={{ padding: '2px 6px', fontSize: '0.68rem' }}
          onClick={handleReactivate}
          title="Allow sending again today"
        >
          Send Again
        </button>
      </span>
    );
  }

  return (
    <a className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} href={href} target="_blank" rel="noreferrer" onClick={handleClick}>
      WhatsApp
    </a>
  );
}

// Inline "Set follow-up" control used inside overdue / expiring / upcoming
// rows - lets staff log the reason + date a member promised to pay. The
// *next* follow-up date is deliberately not set here - that's decided
// later from the Follow-ups section once the first touch is logged.
function SetFollowupControl({ memberId, category, onSaved }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!memberId) return null;

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api.post('/followups', {
        member_id: memberId,
        category,
        reason,
        follow_up_date: followUpDate || null,
      });
      setOpen(false);
      setReason('');
      setFollowUpDate('');
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setOpen(true)}>
        Set Follow-up
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
      {err && <div style={{ color: 'var(--red)', fontSize: '0.72rem' }}>{err}</div>}
      <input placeholder="Reason (e.g. will pay in 3 days)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
      <input type="date" title="Promised follow-up date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '4px 6px' }} />
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} disabled={busy} onClick={save}>Save</button>
        <button type="button" className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function Dues() {
  const navigate = useNavigate();
  const [dues, setDues] = useState({ dues: [], total_outstanding: 0 });
  const [duesRange, setDuesRange] = useState({ from: '', to: '' });

  const [overdue, setOverdue] = useState([]);
  const [overdueRange, setOverdueRange] = useState({ from: '', to: '' });

  const [expiring, setExpiring] = useState([]);
  const [expiringRange, setExpiringRange] = useState({ from: '', to: '' });

  const [followups, setFollowups] = useState([]);
  const [error, setError] = useState('');

  function loadDues() {
    api.get('/reports/dues', duesRange).then(setDues).catch((e) => setError(e.message));
  }
  function loadOverdue() {
    api.get('/reports/overdue-members', overdueRange).then((d) => setOverdue(d.members)).catch((e) => setError(e.message));
  }
  function loadExpiring() {
    api.get('/reports/expiring-soon', expiringRange).then((d) => setExpiring(d.members)).catch((e) => setError(e.message));
  }
  function loadFollowups() {
    api.get('/followups').then((d) => setFollowups(d.followups)).catch((e) => setError(e.message));
  }

  useEffect(loadDues, [duesRange]);
  useEffect(loadOverdue, [overdueRange]);
  useEffect(loadExpiring, [expiringRange]);
  useEffect(loadFollowups, []);

  // Most recent follow-up per member (across all categories) - this is
  // each member's "current" follow-up state.
  const latestByMember = useMemo(() => {
    const map = {};
    for (const f of followups) {
      const existing = map[f.member_id];
      if (!existing || new Date(f.created_at) > new Date(existing.created_at)) {
        map[f.member_id] = f;
      }
    }
    return map;
  }, [followups]);

  // Members currently in an active (pending) follow-up - this feeds the
  // 4th section, regardless of which of the first 3 sections they came from.
  const activeFollowups = useMemo(
    () => Object.values(latestByMember).filter((f) => f.status === 'pending'),
    [latestByMember]
  );

  const [overdueSearch, setOverdueSearch] = useState('');
  const [expiringSearch, setExpiringSearch] = useState('');
  const [duesSearch, setDuesSearch] = useState('');
  const [followupSearch, setFollowupSearch] = useState('');

  function matches(q, ...fields) {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return fields.some((f) => (f || '').toLowerCase().includes(needle));
  }

  const filteredOverdue = overdue.filter((m) => matches(overdueSearch, m.name, m.member_code, m.contact));
  const filteredExpiring = expiring.filter((m) => matches(expiringSearch, m.name, m.member_code, m.contact));
  const filteredDues = dues.dues.filter((d) => matches(duesSearch, d.member_name, d.member_code, d.contact, d.bill_number));
  const filteredFollowups = activeFollowups.filter((f) => matches(followupSearch, f.member_name, f.member_code));

  // Has this member already been followed up on (pending, not yet
  // resolved)? Used to highlight them across Overdue/Expiring/Dues too,
  // not just in the Follow-ups section itself.
  function hasActiveFollowup(memberId) {
    return latestByMember[memberId]?.status === 'pending';
  }

  function goToRenewal(memberId) {
    sessionStorage.setItem('renewalPrefillMember', memberId);
    navigate('/renewal');
  }

  async function updateFollowupStatus(followup, status) {
    setError('');
    try {
      await api.patch(`/followups/${followup.id}`, { status });
      loadFollowups();
    } catch (e) {
      setError(e.message);
    }
  }

  async function rescheduleFollowup(followup) {
    const nextDate = prompt('New next follow-up date (YYYY-MM-DD):', followup.next_follow_up_date ? followup.next_follow_up_date.slice(0, 10) : '');
    if (nextDate === null) return;
    setError('');
    try {
      await api.patch(`/followups/${followup.id}`, { next_follow_up_date: nextDate || null });
      loadFollowups();
    } catch (e) {
      setError(e.message);
    }
  }

  async function vacateFromFollowup(followup) {
    if (!confirm(`Vacate ${followup.member_name}'s cabin assignment(s) and mark them inactive?`)) return;
    setError('');
    try {
      await api.post(`/assignments/vacate/${followup.member_id}`);
      await api.patch(`/followups/${followup.id}`, { status: 'vacated' });
      loadFollowups();
      loadOverdue();
      loadExpiring();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateJoiningStatus(followup, joining_status) {
    setError('');
    try {
      await api.patch(`/followups/${followup.id}`, { joining_status });
      loadFollowups();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Billing</div>
          <h1>Dues &amp; Part Payments</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Section 1: Overdue Members */}
      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>1. Overdue Members</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: -6, marginBottom: 12 }}>
          Members whose validity has already lapsed.
        </p>
        <DateFilter
          from={overdueRange.from} to={overdueRange.to}
          onFrom={(v) => setOverdueRange({ ...overdueRange, from: v })}
          onTo={(v) => setOverdueRange({ ...overdueRange, to: v })}
          onClear={() => setOverdueRange({ from: '', to: '' })}
        />
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <input placeholder="Search by name, Member ID or contact…" value={overdueSearch} onChange={(e) => setOverdueSearch(e.target.value)} />
        </div>
        <div className="table-scroll">
        <table>
          <thead><tr><th>Member ID</th><th>Name</th><th>Contact</th><th>Validity End</th><th></th><th></th><th></th></tr></thead>
          <tbody>
            {filteredOverdue.map((m) => (
              <tr key={m.id} style={hasActiveFollowup(m.id) ? { background: 'var(--blue-soft)' } : undefined}>
                <td>{m.member_code}</td>
                <td>
                  {m.name}
                  {hasActiveFollowup(m.id) && <span className="badge" style={{ marginLeft: 6, background: 'var(--blue)', color: '#fff' }}>Followed Up</span>}
                </td>
                <td>{m.contact}</td>
                <td>{formatDate(m.validity_end)}</td>
                <td>
                  <WhatsAppButton
                    contact={m.contact}
                    sentKey={`overdue:${m.id}`}
                    text={`Hi ${m.name}, your library membership (${m.member_code}) expired on ${formatDate(m.validity_end)}. Please renew at your earliest convenience — Shiv Shakti Library.`}
                  />
                </td>
                <td>
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => goToRenewal(m.id)}>Renewal</button>
                </td>
                <td><SetFollowupControl memberId={m.id} category="overdue" onSaved={loadFollowups} /></td>
              </tr>
            ))}
            {filteredOverdue.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>No overdue members match.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Section 2: Expiring Soon */}
      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>2. Expiring Soon</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: -6, marginBottom: 12 }}>
          Defaults to the next 7 days — adjust the range to look further ahead.
        </p>
        <DateFilter
          from={expiringRange.from} to={expiringRange.to}
          onFrom={(v) => setExpiringRange({ ...expiringRange, from: v })}
          onTo={(v) => setExpiringRange({ ...expiringRange, to: v })}
          onClear={() => setExpiringRange({ from: '', to: '' })}
        />
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <input placeholder="Search by name, Member ID or contact…" value={expiringSearch} onChange={(e) => setExpiringSearch(e.target.value)} />
        </div>
        <div className="table-scroll">
        <table>
          <thead><tr><th>Member ID</th><th>Name</th><th>Contact</th><th>Validity End</th><th></th><th></th><th></th></tr></thead>
          <tbody>
            {filteredExpiring.map((m) => (
              <tr key={m.id} style={hasActiveFollowup(m.id) ? { background: 'var(--blue-soft)' } : undefined}>
                <td>{m.member_code}</td>
                <td>
                  {m.name}
                  {hasActiveFollowup(m.id) && <span className="badge" style={{ marginLeft: 6, background: 'var(--blue)', color: '#fff' }}>Followed Up</span>}
                </td>
                <td>{m.contact}</td>
                <td>{formatDate(m.validity_end)}</td>
                <td>
                  <WhatsAppButton
                    contact={m.contact}
                    sentKey={`expiring:${m.id}`}
                    text={`Hi ${m.name}, your library membership (${m.member_code}) is expiring on ${formatDate(m.validity_end)}. Please renew soon to avoid interruption — Shiv Shakti Library.`}
                  />
                </td>
                <td>
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => goToRenewal(m.id)}>Renewal</button>
                </td>
                <td><SetFollowupControl memberId={m.id} category="expiring_soon" onSaved={loadFollowups} /></td>
              </tr>
            ))}
            {filteredExpiring.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nothing expiring in this range matches.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Section 3: Upcoming / All Other Dues */}
      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>3. Upcoming Dues (Outstanding &amp; Part Payments)</h2>
        <DateFilter
          from={duesRange.from} to={duesRange.to}
          onFrom={(v) => setDuesRange({ ...duesRange, from: v })}
          onTo={(v) => setDuesRange({ ...duesRange, to: v })}
          onClear={() => setDuesRange({ from: '', to: '' })}
        />
        <div className="stat-card" style={{ maxWidth: 260, marginBottom: 14 }}>
          <div className="label">Total Outstanding</div>
          <div className="value">₹{Number(dues.total_outstanding || 0).toLocaleString('en-IN')}</div>
        </div>
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <input placeholder="Search by name, Member ID, contact or bill no…" value={duesSearch} onChange={(e) => setDuesSearch(e.target.value)} />
        </div>
        <div className="table-scroll">
        <table>
          <thead><tr><th>Bill No.</th><th>Member</th><th>Contact</th><th>Final</th><th>Paid</th><th>Due</th><th></th><th></th><th></th></tr></thead>
          <tbody>
            {filteredDues.map((d) => {
              const isPartPayment = Number(d.paid_total) > 0;
              const followedUp = hasActiveFollowup(d.member_id);
              return (
                <tr key={d.id} style={isPartPayment ? { background: 'var(--amber-soft)' } : followedUp ? { background: 'var(--blue-soft)' } : undefined}>
                  <td>{d.bill_number}</td>
                  <td>
                    {d.member_code} — {d.member_name}
                    {followedUp && <span className="badge" style={{ marginLeft: 6, background: 'var(--blue)', color: '#fff' }}>Followed Up</span>}
                  </td>
                  <td>{d.contact}</td>
                  <td>₹{Number(d.final_amount).toLocaleString('en-IN')}</td>
                  <td>₹{Number(d.paid_total).toLocaleString('en-IN')}</td>
                  <td style={{ fontWeight: 700 }}>
                    ₹{Number(d.due_amount).toLocaleString('en-IN')}
                    {isPartPayment && (
                      <div>
                        <span className="badge" style={{ background: 'var(--amber)', color: '#fff', fontWeight: 700, marginTop: 3 }}>
                          Part Payment
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn secondary"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      onClick={() => {
                        sessionStorage.setItem('prefillBillingPayment', JSON.stringify({ bill_id: d.id, amount: d.due_amount }));
                        navigate('/billing');
                      }}
                    >
                      Pay Now
                    </button>
                  </td>
                  <td>
                    <WhatsAppButton
                      contact={d.contact}
                      sentKey={`dues:${d.member_id}`}
                      text={`Hi ${d.member_name}, a payment of ₹${Number(d.due_amount).toLocaleString('en-IN')} is due on bill ${d.bill_number}. Please clear it at your earliest convenience — Shiv Shakti Library.`}
                    />
                  </td>
                  <td><SetFollowupControl memberId={d.member_id} category="upcoming" onSaved={loadFollowups} /></td>
                </tr>
              );
            })}
            {filteredDues.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>No outstanding dues match.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Section 4: Follow-ups */}
      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>4. Follow-ups</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: -6, marginBottom: 12 }}>
          Members with an active follow-up logged from any of the sections above.
        </p>
        <div className="field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <input placeholder="Search by name or Member ID…" value={followupSearch} onChange={(e) => setFollowupSearch(e.target.value)} />
        </div>
        <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Member</th><th>Category</th><th>Reason</th><th>Follow-up Date</th><th>Next Follow-up</th><th>Joining?</th><th></th></tr>
          </thead>
          <tbody>
            {filteredFollowups.map((f) => (
              <tr key={f.id}>
                <td>{f.member_code} — {f.member_name}</td>
                <td style={{ textTransform: 'capitalize' }}>{f.category.replace('_', ' ')}</td>
                <td>{f.reason || '—'}</td>
                <td>{formatDate(f.follow_up_date)}</td>
                <td>{formatDate(f.next_follow_up_date)}</td>
                <td>
                  <select
                    value={f.joining_status || 'undecided'}
                    onChange={(e) => updateJoiningStatus(f, e.target.value)}
                    style={{ fontSize: '0.76rem', padding: '3px 4px' }}
                  >
                    <option value="undecided">Undecided</option>
                    <option value="joining">Joining</option>
                    <option value="not_joining">Not Joining</option>
                  </select>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <WhatsAppButton
                    contact={f.member_contact}
                    sentKey={`followup:${f.member_id}`}
                    text={`Hi ${f.member_name}, following up as discussed${f.reason ? ` — ${f.reason}` : ''}. Please let us know your update — Shiv Shakti Library.`}
                  />
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => rescheduleFollowup(f)}>Next Follow-up</button>
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => updateFollowupStatus(f, 'paid')}>Mark Paid</button>
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => updateFollowupStatus(f, 'not_paid')}>Not Paid</button>
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--red)' }} onClick={() => vacateFromFollowup(f)}>Vacate</button>
                </td>
              </tr>
            ))}
            {filteredFollowups.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>No active follow-ups match — set one from a section above.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}