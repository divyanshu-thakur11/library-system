import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../utils/date';
import { downloadCSV } from '../utils/csv';
import { toWhatsAppNumber } from '../utils/phone';
import { formatTime12h } from '../utils/time';
import MemberPicker from '../components/MemberPicker';

function waLink(contact, text) {
  if (!contact) return null;
  return `https://wa.me/${toWhatsAppNumber(contact)}?text=${encodeURIComponent(text)}`;
}

function FunnelDetailTable({ rows, kind }) {
  return (
    <table style={{ marginTop: 10, fontSize: '0.84rem' }}>
      <thead>
        <tr><th>Name</th><th>Contact</th><th>{kind === 'demo' ? 'Demo Date' : 'Enquiry Date'}</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = waLink(
            r.contact,
            `Hi ${r.name}, following up on your ${kind === 'demo' ? 'demo session' : 'enquiry'} with Shiv Shakti Library. Let us know if you have any questions!`
          );
          return (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.contact || '—'}</td>
              <td>{formatDate(kind === 'demo' ? r.demo_date : r.enquiry_date)}</td>
              <td style={{ textTransform: 'capitalize' }}>{(r.joining_status || 'undecided').replace('_', ' ')}</td>
              <td>
                {href ? (
                  <a className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} href={href} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                ) : (
                  <span style={{ color: 'var(--ink-soft)', fontSize: '0.72rem' }}>No contact</span>
                )}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>None yet.</td></tr>}
      </tbody>
    </table>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [expired, setExpired] = useState([]);
  const [bestCabins, setBestCabins] = useState(null);
  const [error, setError] = useState('');

  const [collectionsRange, setCollectionsRange] = useState({ from: '', to: '' });
  const [collections, setCollections] = useState({ receipts: [], total: 0 });

  const [enquiries, setEnquiries] = useState([]);
  const [demos, setDemos] = useState([]);

  // Member Lookup: search a member, see their current cabin(s) and full
  // payment history (with the validity period each payment granted).
  const [allMembers, setAllMembers] = useState([]);
  const [lookupId, setLookupId] = useState('');
  const [lookupDetail, setLookupDetail] = useState(null);
  const [lookupReceipts, setLookupReceipts] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    api.get('/members').then((d) => setAllMembers(d.members)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lookupId) {
      setLookupDetail(null);
      setLookupReceipts([]);
      return;
    }
    setLookupLoading(true);
    Promise.all([
      api.get(`/members/${lookupId}`),
      api.get('/receipts', { member_id: lookupId }),
    ])
      .then(([memberRes, receiptsRes]) => {
        setLookupDetail(memberRes);
        setLookupReceipts(receiptsRes.receipts || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLookupLoading(false));
  }, [lookupId]);

  const lookupActiveCabins = (lookupDetail?.assignments || []).filter((a) => a.status === 'active');

  function loadCollections() {
    api.get('/reports/collections', collectionsRange).then(setCollections).catch((e) => setError(e.message));
  }

  useEffect(() => {
    api.get('/reports/summary').then(setSummary).catch((e) => setError(e.message));
    api.get('/reports/expired-memberships').then((d) => setExpired(d.members)).catch((e) => setError(e.message));
    api.get('/reports/best-cabins').then(setBestCabins).catch((e) => setError(e.message));
    api.get('/enquiries').then((d) => setEnquiries(d.enquiries)).catch(() => {});
    api.get('/demos').then((d) => setDemos(d.demos)).catch(() => {});
  }, []);

  useEffect(loadCollections, [collectionsRange]);

  const funnel = useMemo(() => {
    const count = (rows, status) => rows.filter((r) => r.joining_status === status).length;
    return {
      enquiries: {
        total: enquiries.length,
        joining: count(enquiries, 'joining'),
        notJoining: count(enquiries, 'not_joining'),
        undecided: count(enquiries, 'undecided'),
      },
      demos: {
        total: demos.length,
        joining: count(demos, 'joining'),
        notJoining: count(demos, 'not_joining'),
        undecided: count(demos, 'undecided'),
      },
    };
  }, [enquiries, demos]);

  function exportExpiredCSV() {
    downloadCSV(
      'expired-memberships.csv',
      [
        { key: 'member_code', label: 'Member ID' },
        { key: 'name', label: 'Name' },
        { key: 'contact', label: 'Contact' },
        { key: 'validity_end', label: 'Validity End' },
      ],
      expired.map((m) => ({ ...m, validity_end: formatDate(m.validity_end) }))
    );
  }

  function exportCollectionsCSV() {
    downloadCSV(
      'collections.csv',
      [
        { key: 'receipt_number', label: 'Receipt No.' },
        { key: 'amount_paid', label: 'Amount Paid' },
        { key: 'payment_mode', label: 'Payment Mode' },
        { key: 'paid_at', label: 'Date' },
      ],
      collections.receipts.map((r) => ({ ...r, paid_at: formatDate(r.paid_at) }))
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Reports</div>
          <h1>Reports</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
          <StatCard label="Total Collections" value={`₹${summary.total_collections.toLocaleString('en-IN')}`} />
          <StatCard label="Active Members" value={summary.active_members} />
          <StatCard label="Active Cabins" value={summary.active_cabins} />
          <StatCard
            label="Slot Occupancy"
            value={`${summary.cabin_occupancy.occupied_slots}/${summary.cabin_occupancy.total_slots}`}
          />
          <StatCard label="Expired Memberships" value={summary.expired_memberships} />
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Member Lookup</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: 0, marginBottom: 12 }}>
          Search a member by name to see their current cabin and full payment history.
        </p>
        <div className="field" style={{ maxWidth: 380, marginBottom: 14 }}>
          <MemberPicker members={allMembers} value={lookupId} onChange={setLookupId} />
        </div>

        {lookupLoading && <div style={{ color: 'var(--ink-soft)' }}>Loading…</div>}

        {lookupDetail && !lookupLoading && (
          <>
            <div style={{ marginBottom: 14, fontSize: '0.9rem' }}>
              <strong>Current Cabin{lookupActiveCabins.length !== 1 ? 's' : ''}:</strong>{' '}
              {lookupActiveCabins.length === 0
                ? 'None currently assigned'
                : lookupActiveCabins.map((a) => `Cabin ${a.cabin_number} (${formatTime12h(a.start_time)}–${formatTime12h(a.end_time)})`).join(', ')}
            </div>

            <h3 style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Payment History</h3>
            <table>
              <thead>
                <tr><th>Date</th><th>Receipt No.</th><th>Amount Paid</th><th>Mode</th><th>Validity Granted</th></tr>
              </thead>
              <tbody>
                {lookupReceipts.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.paid_at)}</td>
                    <td>{r.receipt_number}</td>
                    <td>₹{Number(r.amount_paid).toLocaleString('en-IN')}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.payment_mode}</td>
                    <td>
                      {r.pending_validity_start || r.pending_validity_end
                        ? `${formatDate(r.pending_validity_start)} – ${formatDate(r.pending_validity_end)}`
                        : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                    </td>
                  </tr>
                ))}
                {lookupReceipts.length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>No payments recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Collections</h2>
          <button className="btn secondary" onClick={exportCollectionsCSV} disabled={collections.receipts.length === 0}>
            Export CSV
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={collectionsRange.from} onChange={(e) => setCollectionsRange({ ...collectionsRange, from: e.target.value })} style={{ width: 160 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={collectionsRange.to} onChange={(e) => setCollectionsRange({ ...collectionsRange, to: e.target.value })} style={{ width: 160 }} />
          </div>
          <button className="btn secondary" onClick={() => setCollectionsRange({ from: '', to: '' })} style={{ padding: '8px 12px' }}>Clear (All-time)</button>
        </div>
        <div className="stat-card" style={{ maxWidth: 240, marginBottom: 14 }}>
          <div className="label">{collectionsRange.from || collectionsRange.to ? 'Total in Range' : 'Total Received (All-time)'}</div>
          <div className="value">₹{(collections.total || 0).toLocaleString('en-IN')}</div>
        </div>
        <table>
          <thead><tr><th>Receipt No.</th><th>Amount</th><th>Mode</th><th>Date</th></tr></thead>
          <tbody>
            {collections.receipts.slice(0, 25).map((r) => (
              <tr key={r.id}>
                <td>{r.receipt_number}</td>
                <td>₹{Number(r.amount_paid).toLocaleString('en-IN')}</td>
                <td>{r.payment_mode}</td>
                <td>{formatDate(r.paid_at)}</td>
              </tr>
            ))}
            {collections.receipts.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>No receipts in this range.</td></tr>}
          </tbody>
        </table>
        {collections.receipts.length > 25 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 8 }}>
            Showing the 25 most recent — export CSV for the full list ({collections.receipts.length} receipts).
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Best Available Cabins</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: 0, marginBottom: 12 }}>
          Ranked by free hours left today ({bestCabins?.operating_hours.start}–{bestCabins?.operating_hours.end}, {bestCabins?.window_hours}h window), then by fewest members currently assigned. Use this to quickly pick where to seat a new member.
        </p>
        <table>
          <thead><tr><th>Cabin</th><th>Free Hours Today</th><th>Booked Hours Today</th><th>Members Assigned</th></tr></thead>
          <tbody>
            {bestCabins?.cabins.slice(0, 10).map((c, i) => (
              <tr key={c.id}>
                <td>
                  Cabin {c.cabin_number}
                  {i === 0 && c.free_hours > 0 && <span className="badge active" style={{ marginLeft: 8 }}>Recommended</span>}
                </td>
                <td>{c.free_hours}h</td>
                <td>{c.used_hours}h</td>
                <td>{c.member_count}</td>
              </tr>
            ))}
            {(!bestCabins || bestCabins.cabins.length === 0) && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>No cabins yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Enquiry &amp; Demo Funnel</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Enquiries</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <StatCard label="Total" value={funnel.enquiries.total} />
              <StatCard label="Joining" value={funnel.enquiries.joining} />
              <StatCard label="Not Joining" value={funnel.enquiries.notJoining} />
              <StatCard label="Undecided" value={funnel.enquiries.undecided} />
            </div>
            <FunnelDetailTable rows={enquiries} kind="enquiry" />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginBottom: 8 }}>Demos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <StatCard label="Total" value={funnel.demos.total} />
              <StatCard label="Joining" value={funnel.demos.joining} />
              <StatCard label="Not Joining" value={funnel.demos.notJoining} />
              <StatCard label="Undecided" value={funnel.demos.undecided} />
            </div>
            <FunnelDetailTable rows={demos} kind="demo" />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Expired Memberships</h2>
          <button className="btn secondary" onClick={exportExpiredCSV} disabled={expired.length === 0}>Export CSV</button>
        </div>
        <table>
          <thead>
            <tr><th>Member ID</th><th>Name</th><th>Contact</th><th>Validity End</th></tr>
          </thead>
          <tbody>
            {expired.map((m) => (
              <tr key={m.id}>
                <td>{m.member_code}</td>
                <td>{m.name}</td>
                <td>{m.contact}</td>
                <td>{formatDate(m.validity_end)}</td>
              </tr>
            ))}
            {expired.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>None — all memberships current.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}