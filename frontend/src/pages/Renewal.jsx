import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import MemberPicker from '../components/MemberPicker';
import DateInputDMY from '../components/DateInputDMY';
import { formatDate } from '../utils/date';
import { formatTime12h } from '../utils/time';

// Renewing an existing member. Two paths once a member is picked:
//
// 1. "Change Cabin" - hands off to the Cabins tab's Assign form, with the
//    member and a starting validity date (the day their last paid-for
//    period ended) already filled in. Finishing there with "Assign & Bill"
//    completes the renewal in one flow.
//
// 2. Keep the same cabin - optionally tweak the time range(s) right here,
//    set the new validity end, and "Renew & Bill" applies everything and
//    jumps to Billing with the member pre-selected.
export default function Renewal() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null); // { member, assignments }
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  const [editedSlots, setEditedSlots] = useState({}); // assignmentId -> { start_time, end_time }
  const [editingTimings, setEditingTimings] = useState(false);
  const [validityStart, setValidityStart] = useState('');
  const [validityEnd, setValidityEnd] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/members').then((d) => setMembers(d.members)).catch(() => {});
  }, []);

  // Coming from a "Renewal" button on Members or Dues tab.
  useEffect(() => {
    const pending = sessionStorage.getItem('renewalPrefillMember');
    if (!pending) return;
    sessionStorage.removeItem('renewalPrefillMember');
    setSelectedId(pending);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError('');
    api
      .get(`/members/${selectedId}`)
      .then((d) => {
        setDetail(d);
        // New validity period starts exactly where the last one ended -
        // that's the whole point of a renewal, no gap and no overlap.
        setValidityStart(d.member.validity_end ? d.member.validity_end.slice(0, 10) : '');
        setValidityEnd('');
        setEditedSlots({});
        setEditingTimings(false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const activeAssignments = (detail?.assignments || []).filter((a) => a.status === 'active');

  function updateSlotTime(assignmentId, field, value) {
    setEditedSlots((prev) => ({
      ...prev,
      [assignmentId]: {
        start_time: prev[assignmentId]?.start_time ?? activeAssignments.find((a) => a.id === assignmentId).start_time.slice(0, 5),
        end_time: prev[assignmentId]?.end_time ?? activeAssignments.find((a) => a.id === assignmentId).end_time.slice(0, 5),
        [field]: value,
      },
    }));
  }

  const [releasingCabin, setReleasingCabin] = useState(false);

  async function goChangeCabin() {
    if (!detail) return;
    setError('');
    setReleasingCabin(true);
    try {
      // Release their current cabin(s) first - otherwise the new
      // assignment gets added alongside the old one instead of replacing
      // it, leaving them double-booked.
      for (const a of activeAssignments) {
        await api.patch(`/assignments/${a.id}/end`);
      }
      sessionStorage.setItem(
        'renewalCabinPrefill',
        JSON.stringify({ member_id: detail.member.id, validity_start: validityStart })
      );
      navigate('/cabins');
    } catch (err) {
      setError(err.message);
      setReleasingCabin(false);
    }
  }

  async function handleRenewAndBill() {
    if (!detail) return;
    if (!validityEnd) {
      setError('Set the new Validity End date before renewing.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Apply any timing edits: end the old slot, create a fresh one in
      // the same cabin with the new times.
      for (const a of activeAssignments) {
        const edited = editedSlots[a.id];
        if (!edited) continue;
        if (edited.start_time === a.start_time.slice(0, 5) && edited.end_time === a.end_time.slice(0, 5)) continue;

        await api.patch(`/assignments/${a.id}/end`);
        const slotRes = await api.post(`/cabins/${a.cabin_id}/time-slots`, {
          start_time: edited.start_time,
          end_time: edited.end_time,
        });
        await api.post('/assignments', {
          member_id: detail.member.id,
          cabin_id: a.cabin_id,
          time_slot_id: slotRes.time_slot.id,
          is_special_case: a.is_special_case,
        });
      }

      // The new validity period is attached to the bill, not applied here
      // directly - it only actually lands on the member once that bill is
      // paid in full (see receiptController.createReceipt). A part
      // payment must never extend validity on its own.
      sessionStorage.setItem('prefillBillingMember', detail.member.id);
      sessionStorage.setItem('pendingValidityForBill', JSON.stringify({ start: validityStart, end: validityEnd }));
      navigate('/billing');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Renewal</div>
          <h1>Renew a Membership</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Search Member</label>
          <MemberPicker members={members} value={selectedId} onChange={setSelectedId} />
        </div>
      </div>

      {loadingDetail && <div className="card">Loading member details…</div>}

      {detail && !loadingDetail && (
        <>
          <div className="card">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>Current Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: '0.9rem', marginBottom: 14 }}>
              <div><strong>Member ID:</strong> {detail.member.member_code}</div>
              <div><strong>Name:</strong> {detail.member.name}</div>
              <div><strong>Contact:</strong> {detail.member.contact}</div>
              <div><strong>Current Validity:</strong> {formatDate(detail.member.validity_start)} to {formatDate(detail.member.validity_end)}</div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong>Current Cabin(s):</strong>{' '}
                {activeAssignments.length === 0
                  ? 'None currently assigned'
                  : activeAssignments.map((a) => `Cabin ${a.cabin_number} (${formatTime12h(a.start_time)}–${formatTime12h(a.end_time)})`).join(', ')}
              </div>
            </div>

            <button className="btn secondary" onClick={goChangeCabin} disabled={releasingCabin}>
              {releasingCabin ? 'Releasing current cabin…' : 'Change Cabin (go to Cabins tab)'}
            </button>
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Renew with the Same Cabin</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: 0, marginBottom: 14 }}>
              Keeps their current cabin. Validity Start is pre-filled with the day their last paid period ended, so
              there's no gap or overlap - adjust if needed.
            </p>

            {activeAssignments.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                  <input type="checkbox" checked={editingTimings} onChange={(e) => setEditingTimings(e.target.checked)} />
                  Change their timing(s) too (optional)
                </label>
                {editingTimings &&
                  activeAssignments.map((a) => {
                    const edited = editedSlots[a.id];
                    const start = edited?.start_time ?? a.start_time.slice(0, 5);
                    const end = edited?.end_time ?? a.end_time.slice(0, 5);
                    return (
                      <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'end', marginTop: 10 }}>
                        <span style={{ fontSize: '0.85rem', minWidth: 80 }}>Cabin {a.cabin_number}</span>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.7rem' }}>Start</label>
                          <input type="time" value={start} onChange={(e) => updateSlotTime(a.id, 'start_time', e.target.value)} />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '0.7rem' }}>End</label>
                          <input type="time" value={end} onChange={(e) => updateSlotTime(a.id, 'end_time', e.target.value)} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Validity Start</label>
                <DateInputDMY value={validityStart} onChange={setValidityStart} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Validity End</label>
                <DateInputDMY value={validityEnd} onChange={setValidityEnd} />
              </div>
            </div>

            <button className="btn" onClick={handleRenewAndBill} disabled={saving}>
              {saving ? 'Renewing…' : 'Renew & Bill'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}