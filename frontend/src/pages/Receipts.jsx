import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toWhatsAppNumber } from '../utils/phone';
import { formatDate } from '../utils/date';

function buildReceiptMessage(r) {
  return (
    `Shiv Shakti Library — Payment Receipt\n` +
    `Receipt No: ${r.receipt_number}\n` +
    `Bill No: ${r.bill_number}\n` +
    `Member: ${r.member_code} — ${r.member_name}\n` +
    `Amount Paid: ₹${Number(r.amount_paid).toLocaleString('en-IN')}\n` +
    `Remaining Due: ₹${Number(r.due_amount).toLocaleString('en-IN')}\n` +
    `Payment Mode: ${r.payment_mode}\n` +
    `Date: ${formatDate(r.paid_at)}`
  );
}

// Approving a bill and recording its first payment happens on the Billing
// tab. This tab shows the resulting receipts for reference, re-sending,
// and - for the Owner only - correcting a receipt after the fact (wrong
// amount entered, wrong payment mode, etc).
export default function Receipts() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  async function load() {
    const data = await api.get('/receipts').catch((e) => { setError(e.message); return { receipts: [] }; });
    setReceipts(data.receipts);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter(
      (r) =>
        r.member_name?.toLowerCase().includes(q) ||
        r.member_code?.toLowerCase().includes(q) ||
        r.receipt_number?.toLowerCase().includes(q)
    );
  }, [receipts, search]);

  function startEdit(r) {
    setEditingId(r.id);
    setError('');
    setEditForm({
      receipt_number: r.receipt_number,
      bill_number: r.bill_number,
      amount_paid: Number(r.amount_paid).toString(),
      payment_mode: r.payment_mode,
      paid_at: r.paid_at ? r.paid_at.slice(0, 10) : '',
    });
  }

  async function saveEdit(id) {
    setError('');
    try {
      await api.patch(`/receipts/${id}`, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Receipts</div>
          <h1>Payments</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
          <input placeholder="Search by name, Member ID or receipt no…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th>Receipt No.</th><th>Bill No.</th><th>Member</th><th>Paid</th><th>Due</th><th>Mode</th><th>Date</th><th>Approved By</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.map((r) =>
              editingId === r.id ? (
                <tr key={r.id}>
                  <td colSpan={9}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Receipt No.</label>
                        <input value={editForm.receipt_number} onChange={(e) => setEditForm({ ...editForm, receipt_number: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Bill No.</label>
                        <input value={editForm.bill_number} onChange={(e) => setEditForm({ ...editForm, bill_number: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Amount Paid (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.amount_paid}
                          onChange={(e) => setEditForm({ ...editForm, amount_paid: e.target.value })}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Mode of Payment</label>
                        <select value={editForm.payment_mode} onChange={(e) => setEditForm({ ...editForm, payment_mode: e.target.value })}>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Date</label>
                        <input type="date" value={editForm.paid_at} onChange={(e) => setEditForm({ ...editForm, paid_at: e.target.value })} />
                      </div>
                      <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => saveEdit(r.id)}>Save</button>
                      <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--ink-soft)', paddingBottom: 8 }}>
                      If this bill has other part payments, their "due after this payment" amounts will be recalculated automatically to stay consistent.
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>{r.receipt_number}</td>
                  <td>{r.bill_number}</td>
                  <td>{r.member_code} — {r.member_name}</td>
                  <td>₹{Number(r.amount_paid).toLocaleString('en-IN')}</td>
                  <td>₹{Number(r.due_amount).toLocaleString('en-IN')}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.payment_mode}</td>
                  <td>{formatDate(r.paid_at)}</td>
                  <td>{r.approved_by || '—'}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a
                      className="btn secondary"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      href={`https://wa.me/${toWhatsAppNumber(r.member_contact)}?text=${encodeURIComponent(buildReceiptMessage(r))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Send
                    </a>
                    {user?.role === 'admin' && (
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => startEdit(r)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
            {filteredReceipts.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>No receipts match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}