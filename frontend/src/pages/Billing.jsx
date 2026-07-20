import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { toLocalDateInput, formatDate } from '../utils/date';
import { formatTime12h } from '../utils/time';
import MemberPicker from '../components/MemberPicker';
import DateInputDMY from '../components/DateInputDMY';

const emptyForm = { member_id: '', fee_structure_id: '', package_type: 'Monthly', total_hours: '', base_amount: '', discount: '0', payment_mode: 'cash', bill_date: toLocalDateInput(), amount_paid_now: '', pending_validity_start: '', pending_validity_end: '' };
const emptyPaymentForm = { bill_id: '', amount_paid: '', payment_mode: 'cash', paid_at: toLocalDateInput() };

export default function Billing() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [members, setMembers] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [billSearch, setBillSearch] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [memberBooking, setMemberBooking] = useState(null);
  const [memberBookingLoading, setMemberBookingLoading] = useState(false);

  async function load() {
    const data = await api.get('/billing').catch((e) => { setError(e.message); return { bills: [] }; });
    setBills(data.bills);
  }

  useEffect(() => {
    load();
    // Unlike Cabins (where only active members make sense to assign),
    // Billing needs everyone - a member who was vacated/marked inactive
    // may still owe a final settlement.
    api.get('/members').then((d) => setMembers(d.members)).catch(() => {});
    api.get('/fee-structures').then((d) => setFeeStructures(d.fee_structures)).catch(() => {});
  }, []);

  // Whenever a member is picked in the New Bill form, pull their current
  // active cabin assignments and total up the hours/day they're booked for
  // - handy context right where the fee amount is being decided.
  useEffect(() => {
    if (!form.member_id) {
      setMemberBooking(null);
      return;
    }
    setMemberBookingLoading(true);
    api
      .get(`/members/${form.member_id}`)
      .then((d) => {
        const active = (d.assignments || []).filter((a) => a.status === 'active');
        const totalHours = active.reduce((sum, a) => {
          const [sh, sm] = a.start_time.slice(0, 5).split(':').map(Number);
          const [eh, em] = a.end_time.slice(0, 5).split(':').map(Number);
          return sum + (eh * 60 + em - (sh * 60 + sm)) / 60;
        }, 0);
        setMemberBooking({ assignments: active, totalHours });
      })
      .catch(() => setMemberBooking(null))
      .finally(() => setMemberBookingLoading(false));
  }, [form.member_id]);

  // Coming from Cabins tab's "Assign & Bill" or Renewal's "Renew & Bill" -
  // pre-select that member, open the New Bill form, and carry through the
  // validity period this bill is meant to grant (applied only once it's
  // actually paid in full - see the backend).
  useEffect(() => {
    const pending = sessionStorage.getItem('prefillBillingMember');
    if (!pending) return;
    sessionStorage.removeItem('prefillBillingMember');

    let pendingValidity = { start: '', end: '' };
    const validityRaw = sessionStorage.getItem('pendingValidityForBill');
    if (validityRaw) {
      sessionStorage.removeItem('pendingValidityForBill');
      try {
        pendingValidity = JSON.parse(validityRaw);
      } catch {
        // malformed - ignore
      }
    }

    setForm((f) => ({
      ...f,
      member_id: pending,
      pending_validity_start: pendingValidity.start || '',
      pending_validity_end: pendingValidity.end || '',
    }));
    setShowForm(true);
  }, []);

  // Coming from Dues tab's "Pay Now" on a specific bill - open the payment
  // form with that exact bill and amount pre-filled.
  useEffect(() => {
    const pending = sessionStorage.getItem('prefillBillingPayment');
    if (!pending) return;
    sessionStorage.removeItem('prefillBillingPayment');
    try {
      const { bill_id, amount } = JSON.parse(pending);
      setPaymentForm({ bill_id, amount_paid: Number(amount).toString(), payment_mode: 'cash', paid_at: toLocalDateInput() });
      setShowPaymentForm(true);
    } catch {
      // malformed sessionStorage value - ignore
    }
  }, []);

  function handleFeeStructureChange(id) {
    const fs = feeStructures.find((f) => f.id === id);
    if (fs) {
      setForm({ ...form, fee_structure_id: id, package_type: fs.package_type, total_hours: fs.hours_per_day, base_amount: fs.amount });
    } else {
      setForm({ ...form, fee_structure_id: '' });
    }
  }

  const [justCreatedNote, setJustCreatedNote] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setJustCreatedNote('');
    try {
      const { amount_paid_now, ...billFields } = form;
      const res = await api.post('/billing', billFields);
      const paidNow = Number(amount_paid_now || 0);

      if (paidNow > 0 && user?.role === 'admin') {
        // Owner creating the bill and recording a payment (full or part) in
        // one step - no separate approval click needed.
        await api.post('/receipts', { bill_id: res.bill.id, amount_paid: paidNow, payment_mode: form.payment_mode, paid_at: form.bill_date });
        const remaining = Number(res.bill.final_amount) - paidNow;
        setJustCreatedNote(
          remaining > 0.01
            ? `Bill ${res.bill.bill_number} created. ₹${paidNow.toLocaleString('en-IN')} recorded as a part payment — ₹${remaining.toLocaleString('en-IN')} still due.`
            : `Bill ${res.bill.bill_number} created and fully paid.`
        );
      } else if (paidNow > 0) {
        // Manager: can't approve/record payment themselves - leave the
        // amount as a clear note so the Owner knows what to record.
        setJustCreatedNote(
          `Bill ${res.bill.bill_number} created. ₹${paidNow.toLocaleString('en-IN')} was reported as paid via ${form.payment_mode} — ask the Owner to record this under "Approve & Record Payment".`
        );
      }

      setForm({ ...emptyForm, bill_date: toLocalDateInput() });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleVoid(bill) {
    const reason = prompt(`Void bill ${bill.bill_number}? Enter a reason (this is kept for the audit trail):`);
    if (!reason) return;
    setError('');
    try {
      await api.patch(`/billing/${bill.id}/void`, { reason });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const [approvingAll, setApprovingAll] = useState(false);

  async function handleApproveAll() {
    if (!confirm('Approve and fully record payment for every remaining outstanding bill? This cannot be undone in bulk - you can still edit individual receipts afterward if something needs correcting.')) return;
    setApprovingAll(true);
    setError('');
    try {
      const res = await api.post('/billing/approve-all');
      setJustCreatedNote(`Approved and recorded payment for ${res.approved.length} bill${res.approved.length === 1 ? '' : 's'}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovingAll(false);
    }
  }

  const [editingBillId, setEditingBillId] = useState(null);
  const [billEditForm, setBillEditForm] = useState(null);

  function startBillEdit(b) {
    setEditingBillId(b.id);
    setBillEditForm({
      bill_number: b.bill_number,
      package_type: b.package_type,
      total_hours: b.total_hours || '',
      base_amount: Number(b.base_amount).toString(),
      discount: Number(b.discount).toString(),
      payment_mode: b.payment_mode || 'cash',
    });
  }

  async function saveBillEdit(id) {
    setError('');
    try {
      await api.patch(`/billing/${id}`, billEditForm);
      setEditingBillId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // "Non-approved" = still needs action - pending or partially paid.
  // Fully paid and voided bills drop off this default view since there's
  // nothing left to do; the "show all" toggle brings them back for
  // reference/audit.
  const unapprovedBills = useMemo(
    () => bills.filter((b) => b.status === 'pending' || b.status === 'partial'),
    [bills]
  );

  const visibleBills = showAll ? bills : unapprovedBills;

  const filteredBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleBills;
    return visibleBills.filter(
      (b) => b.member_name?.toLowerCase().includes(q) || b.member_code?.toLowerCase().includes(q) || b.bill_number?.toLowerCase().includes(q)
    );
  }, [visibleBills, search]);

  const paymentEligibleBills = useMemo(() => {
    const q = billSearch.trim().toLowerCase();
    if (!q) return unapprovedBills;
    return unapprovedBills.filter(
      (b) => b.member_name?.toLowerCase().includes(q) || b.member_code?.toLowerCase().includes(q)
    );
  }, [unapprovedBills, billSearch]);

  const selectedBill = bills.find((b) => b.id === paymentForm.bill_id) || null;

  function selectBillForPayment(billId) {
    const bill = bills.find((b) => b.id === billId);
    setPaymentForm({
      bill_id: billId,
      amount_paid: bill ? Number(bill.due_amount).toString() : '',
      payment_mode: bill?.payment_mode || 'cash',
      paid_at: toLocalDateInput(),
    });
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/receipts', { ...paymentForm, amount_paid: Number(paymentForm.amount_paid) });
      setPaymentForm(emptyPaymentForm);
      setShowPaymentForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Billing</div>
          <h1>Bills</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {user?.role === 'admin' && (
            <>
              <button className="btn secondary" onClick={() => setShowPaymentForm((s) => !s)}>
                {showPaymentForm ? 'Cancel' : '✓ Approve & Record Payment'}
              </button>
              <button className="btn secondary" onClick={handleApproveAll} disabled={approvingAll} style={{ borderColor: 'var(--green-700)', color: 'var(--green-700)' }}>
                {approvingAll ? 'Approving…' : '✓✓ Approve All Remaining'}
              </button>
            </>
          )}
          <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New Bill'}</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {user?.role === 'manager' && (
        <div className="checkbox-row" style={{ marginBottom: 18 }}>
          Only the Owner can approve a bill and record its payment. You can generate new bills below; once payment
          is recorded and approved, they'll move to the Receipts tab.
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Member</label>
              <MemberPicker
                members={members}
                value={form.member_id}
                onChange={(id) => setForm({ ...form, member_id: id })}
              />
              {form.member_id && (
                <div style={{ marginTop: 6, fontSize: '0.8rem' }}>
                  {memberBookingLoading ? (
                    <span style={{ color: 'var(--ink-soft)' }}>Checking their current cabin booking…</span>
                  ) : memberBooking && memberBooking.assignments.length > 0 ? (
                    <div style={{ background: 'var(--paper-sunken)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
                      <strong>{memberBooking.totalHours}h/day</strong> currently booked across {memberBooking.assignments.length} slot{memberBooking.assignments.length > 1 ? 's' : ''}:
                      <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                        {memberBooking.assignments.map((a, i) => (
                          <div key={i}>
                            Cabin {a.cabin_number}: {formatTime12h(a.start_time)}–{formatTime12h(a.end_time)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--ink-soft)' }}>No active cabin booking for this member.</span>
                  )}
                </div>
              )}
            </div>
            <div className="field">
              <label>Fee Structure (auto-fills fee)</label>
              <select value={form.fee_structure_id} onChange={(e) => handleFeeStructureChange(e.target.value)}>
                <option value="">Custom / manual amount…</option>
                {feeStructures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.package_type} — {f.hours_per_day} hrs/day — ₹{Number(f.amount).toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Package Type</label>
              <input value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value, fee_structure_id: '' })} required />
            </div>
            <div className="field">
              <label>Total Hours</label>
              <input type="number" step="0.5" value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: e.target.value })} />
            </div>
            <div className="field">
              <label>Base Amount (₹)</label>
              <input type="number" step="0.01" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} required />
            </div>
            <div className="field">
              <label>Discount (₹)</label>
              <input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
            </div>
            <div className="field">
              <label>Amount Paid Now (optional — leave blank if unpaid)</label>
              <input
                type="number"
                step="0.01"
                value={form.amount_paid_now}
                onChange={(e) => setForm({ ...form, amount_paid_now: e.target.value })}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label>Mode of Payment</label>
              <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div className="field">
              <label>Billing Date</label>
              <DateInputDMY value={form.bill_date} onChange={(v) => setForm({ ...form, bill_date: v })} />
            </div>
            <div className="field">
              <label>Validity Start (optional)</label>
              <DateInputDMY value={form.pending_validity_start} onChange={(v) => setForm({ ...form, pending_validity_start: v })} />
            </div>
            <div className="field">
              <label>Validity End (optional)</label>
              <DateInputDMY value={form.pending_validity_end} onChange={(v) => setForm({ ...form, pending_validity_end: v })} />
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: -8, marginBottom: 14 }}>
            If set, this validity period is applied to the member only once this bill is fully paid — a part payment
            won't extend it early. Leave blank if this bill isn't tied to a specific validity period.
          </p>
          {(() => {
            const finalPayable = Number(form.base_amount || 0) - Number(form.discount || 0);
            const paidNow = Number(form.amount_paid_now || 0);
            const remaining = finalPayable - paidNow;
            const isPartPayment = paidNow > 0 && remaining > 0.01;
            return (
              <div
                className="card"
                style={{
                  background: isPartPayment ? 'var(--amber-soft)' : 'var(--paper-2, #f7f5f0)',
                  border: isPartPayment ? '2px solid var(--amber)' : undefined,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', gap: 24, fontSize: '0.92rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>Total: <strong>₹{Number(form.base_amount || 0).toLocaleString('en-IN')}</strong></div>
                  <div>Discount: <strong style={{ color: 'var(--red)' }}>− ₹{Number(form.discount || 0).toLocaleString('en-IN')}</strong></div>
                  <div>Final Payable: <strong style={{ color: 'var(--green-700)' }}>₹{finalPayable.toLocaleString('en-IN')}</strong></div>
                  {paidNow > 0 && (
                    <div>Paid Now: <strong style={{ color: 'var(--green-700)' }}>− ₹{paidNow.toLocaleString('en-IN')}</strong></div>
                  )}
                  <div>
                    Remaining Due: <strong style={{ fontSize: isPartPayment ? '1.1rem' : undefined }}>₹{Math.max(0, remaining).toLocaleString('en-IN')}</strong>
                    {isPartPayment && (
                      <span className="badge" style={{ background: 'var(--amber)', color: '#fff', fontWeight: 700, marginLeft: 8 }}>
                        Part Payment
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          {(form.pending_validity_start || form.pending_validity_end) && (
            <div className="checkbox-row" style={{ marginBottom: 14 }}>
              This bill will set their validity to <strong>{formatDate(form.pending_validity_start)} – {formatDate(form.pending_validity_end)}</strong> once
              it's paid in full. A part payment will not change their validity yet.
            </div>
          )}
          <button className="btn" type="submit">Generate Bill</button>
        </form>
      )}

      {justCreatedNote && (
        <div className="card" style={{ background: 'var(--green-soft)', borderColor: 'var(--green-500)' }}>
          {justCreatedNote}
        </div>
      )}

      {showPaymentForm && user?.role === 'admin' && (
        <form className="card" onSubmit={handleRecordPayment}>
          <div className="field" style={{ maxWidth: 360 }}>
            <label>Search by member name or Member ID</label>
            <input
              placeholder="Search unapproved bills…"
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Bill (unapproved only)</label>
              <select value={paymentForm.bill_id} onChange={(e) => selectBillForPayment(e.target.value)} required>
                <option value="">Select bill…</option>
                {paymentEligibleBills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bill_number} — {b.member_code} — {b.member_name} (due ₹{Number(b.due_amount).toLocaleString('en-IN')} of ₹{Number(b.final_amount).toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
              {paymentEligibleBills.length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                  No unapproved bills match — everything is settled, or try a different search.
                </div>
              )}
            </div>
            <div className="field">
              <label>Amount Paid (₹)</label>
              <input type="number" step="0.01" value={paymentForm.amount_paid} onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })} required />
            </div>
            <div className="field">
              <label>Mode of Payment</label>
              <select value={paymentForm.payment_mode} onChange={(e) => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div className="field">
              <label>Payment Date</label>
              <DateInputDMY value={paymentForm.paid_at} onChange={(v) => setPaymentForm({ ...paymentForm, paid_at: v })} />
            </div>
          </div>

          {selectedBill && (
            <div className="card" style={{ background: 'var(--paper-2, #f7f5f0)', marginBottom: 14 }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginBottom: 4 }}>Member details (auto-fetched)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: '0.9rem' }}>
                <div><strong>Member ID:</strong> {selectedBill.member_code}</div>
                <div><strong>Name:</strong> {selectedBill.member_name}</div>
                <div><strong>Bill No.:</strong> {selectedBill.bill_number}</div>
                <div><strong>Total:</strong> ₹{Number(selectedBill.base_amount).toLocaleString('en-IN')}</div>
                <div><strong>Discount:</strong> − ₹{Number(selectedBill.discount).toLocaleString('en-IN')}</div>
                <div><strong>Final Payable:</strong> ₹{Number(selectedBill.final_amount).toLocaleString('en-IN')}</div>
                <div><strong>Already Paid:</strong> ₹{Number(selectedBill.paid_total).toLocaleString('en-IN')}</div>
                <div><strong>Due:</strong> ₹{Number(selectedBill.due_amount).toLocaleString('en-IN')}</div>
              </div>
            </div>
          )}

          <button className="btn" type="submit">Approve &amp; Record Payment</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="field" style={{ maxWidth: 320, marginBottom: 0 }}>
            <input placeholder="Search by name, Member ID or bill no…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--ink-soft)', fontWeight: 400 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show approved/voided bills too
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bill No.</th><th>Date</th><th>Member</th><th>Package</th><th>Total</th><th>Discount</th><th>Final Payable</th><th>Paid</th><th>Due</th><th>Mode</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredBills.map((b) =>
              editingBillId === b.id ? (
                <tr key={b.id}>
                  <td colSpan={12}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Bill No.</label>
                        <input value={billEditForm.bill_number} onChange={(e) => setBillEditForm({ ...billEditForm, bill_number: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Package</label>
                        <input value={billEditForm.package_type} onChange={(e) => setBillEditForm({ ...billEditForm, package_type: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Total Hours</label>
                        <input type="number" step="0.5" value={billEditForm.total_hours} onChange={(e) => setBillEditForm({ ...billEditForm, total_hours: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Base Amount (₹)</label>
                        <input type="number" step="0.01" value={billEditForm.base_amount} onChange={(e) => setBillEditForm({ ...billEditForm, base_amount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Discount (₹)</label>
                        <input type="number" step="0.01" value={billEditForm.discount} onChange={(e) => setBillEditForm({ ...billEditForm, discount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Mode</label>
                        <select value={billEditForm.payment_mode} onChange={(e) => setBillEditForm({ ...billEditForm, payment_mode: e.target.value })}>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                      <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => saveBillEdit(b.id)}>Save</button>
                      <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingBillId(null)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} style={b.status === 'partial' ? { background: 'var(--amber-soft)' } : undefined}>
                  <td>{b.bill_number}</td>
                  <td>{formatDate(b.created_at)}</td>
                  <td>{b.member_code} — {b.member_name}</td>
                  <td>{b.package_type}</td>
                  <td>₹{Number(b.base_amount).toLocaleString('en-IN')}</td>
                  <td style={{ color: Number(b.discount) > 0 ? 'var(--red)' : 'inherit' }}>
                    {Number(b.discount) > 0 ? `− ₹${Number(b.discount).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td><strong>₹{Number(b.final_amount).toLocaleString('en-IN')}</strong></td>
                  <td>₹{Number(b.paid_total).toLocaleString('en-IN')}</td>
                  <td style={{ fontWeight: b.status === 'partial' ? 700 : 400 }}>
                    ₹{Number(b.due_amount).toLocaleString('en-IN')}
                    {b.status === 'partial' && (
                      <div>
                        <span className="badge" style={{ background: 'var(--amber)', color: '#fff', fontWeight: 700, marginTop: 3 }}>
                          Part Payment
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{b.payment_mode || 'cash'}</td>
                  <td>
                    <span className={`badge ${b.status === 'paid' ? 'active' : b.status === 'partial' ? 'special' : b.status === 'voided' ? 'inactive' : 'inactive'}`} title={b.void_reason || ''}>
                      {b.status}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {b.status !== 'voided' && (
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => startBillEdit(b)}>
                        Edit
                      </button>
                    )}
                    {user?.role === 'admin' && b.status === 'pending' && (
                      <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => handleVoid(b)}>
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
            {filteredBills.length === 0 && <tr><td colSpan={12} style={{ color: 'var(--ink-soft)' }}>Nothing here — everything's settled, or try a different search.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}