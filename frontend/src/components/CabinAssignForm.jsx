import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import MemberPicker from './MemberPicker';
import DateInputDMY from './DateInputDMY';

function computeHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

function rangesOverlap(a, b) {
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

const blankForm = {
  member_id: '',
  cabin_id: '',
  hours_needed: 8,
  slots: [{ start_time: '06:00', end_time: '14:00' }],
  is_special_case: false,
  special_case_reason: '',
  validity_start: '',
  validity_end: '',
};

// Assign-a-cabin form, reused both for brand-new assignments (Cabins tab)
// and for "Assign / Change" on an existing member - `presetMemberId`/
// `presetValidity` seed the form when opened from the latter.
//
// Two ways to finish: "Assign / Change" just saves the assignment; "Assign
// & Bill" saves it and then jumps straight to the Billing tab with this
// member pre-selected, for the common case of assigning + billing in one go.
export default function CabinAssignForm({ cabins, members, assignedMemberIds, settings, presetMemberId, presetValidity, onAssigned, onCancel }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(blankForm);
  const [showAssignedToo, setShowAssignedToo] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetMemberId) {
      setForm({
        ...blankForm,
        member_id: presetMemberId,
        validity_start: presetValidity?.start || '',
        validity_end: presetValidity?.end || '',
      });
      setSuggestion(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMemberId]);

  const totalHours = form.slots.reduce((sum, s) => sum + computeHours(s.start_time, s.end_time), 0);
  const hoursMatch = Math.abs(totalHours - Number(form.hours_needed || 0)) < 0.01;

  function updateSlot(index, field, value) {
    const slots = form.slots.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    setForm({ ...form, slots });
  }

  function addSlot() {
    if (form.slots.length >= 2) return;
    setForm({ ...form, slots: [...form.slots, { start_time: '18:00', end_time: '20:00' }] });
  }

  function removeSlot(index) {
    setForm({ ...form, slots: form.slots.filter((_, i) => i !== index) });
  }

  async function handleSuggest() {
    setError('');
    for (const s of form.slots) {
      if (s.start_time >= s.end_time) {
        setError('Each time range must start before it ends before I can suggest a cabin.');
        return;
      }
    }
    setSuggestBusy(true);
    try {
      const res = await api.post('/cabins/suggest', {
        slots: form.slots,
        validity_start: form.validity_start,
        validity_end: form.validity_end,
      });
      setSuggestion(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSuggestBusy(false);
    }
  }

  function applySuggestion(cabinId) {
    setForm((f) => ({ ...f, cabin_id: cabinId }));
  }

  // Validates + saves the assignment(s). Returns true on success so callers
  // can decide what to do next (stay here, or jump to Billing).
  async function saveAssignment(deferValidityToBill) {
    setError('');

    if (form.slots.length < 1 || form.slots.length > 2) {
      setError('Choose at least 1 and at most 2 time ranges.');
      return false;
    }
    for (const s of form.slots) {
      if (s.start_time >= s.end_time) {
        setError('Each time range must start before it ends.');
        return false;
      }
      if (s.start_time < settings.operating_hours_start || s.end_time > settings.operating_hours_end) {
        setError(`Time ranges must fall within library hours (${settings.operating_hours_start}–${settings.operating_hours_end}).`);
        return false;
      }
    }
    if (form.slots.length === 2 && rangesOverlap(form.slots[0], form.slots[1])) {
      setError('The two time ranges overlap — choose non-overlapping ranges.');
      return false;
    }
    if (!hoursMatch) {
      setError(`Selected time ranges total ${totalHours}h, but the member wants ${form.hours_needed}h/day. Adjust the times so they match.`);
      return false;
    }
    if (!form.member_id || !form.cabin_id) {
      setError('Select a member and a cabin.');
      return false;
    }

    setBusy(true);
    try {
      for (const slot of form.slots) {
        const slotRes = await api.post(`/cabins/${form.cabin_id}/time-slots`, {
          start_time: slot.start_time,
          end_time: slot.end_time,
        });
        await api.post('/assignments', {
          member_id: form.member_id,
          cabin_id: form.cabin_id,
          time_slot_id: slotRes.time_slot.id,
          is_special_case: form.is_special_case,
          special_case_reason: form.special_case_reason,
        });
      }
      // Assign-only (no billing involved) applies validity right away.
      // Assign & Bill defers it - the bill carries the intended period as
      // pending_validity_*, and it only actually lands on the member once
      // that bill is genuinely paid in full (see receiptController), so a
      // part payment can never prematurely extend someone's membership.
      if (!deferValidityToBill && (form.validity_start || form.validity_end)) {
        await api.patch(`/members/${form.member_id}`, {
          validity_start: form.validity_start || null,
          validity_end: form.validity_end || null,
        });
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignOnly() {
    const memberId = form.member_id;
    const ok = await saveAssignment(false);
    if (ok) {
      setForm(blankForm);
      setSuggestion(null);
      onAssigned(memberId);
    }
  }

  async function handleAssignAndBill() {
    const memberId = form.member_id;
    const validity = { start: form.validity_start, end: form.validity_end };
    const ok = await saveAssignment(true);
    if (ok) {
      setForm(blankForm);
      setSuggestion(null);
      sessionStorage.setItem('prefillBillingMember', memberId);
      if (validity.start || validity.end) {
        sessionStorage.setItem('pendingValidityForBill', JSON.stringify(validity));
      }
      navigate('/billing');
    }
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Member</label>
          <MemberPicker
            members={showAssignedToo ? members : members.filter((m) => m.id === presetMemberId || !assignedMemberIds?.has(m.id))}
            value={form.member_id}
            onChange={(id) => setForm({ ...form, member_id: id })}
          />
          {assignedMemberIds && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--ink-soft)', fontWeight: 400, marginTop: 6 }}>
              <input type="checkbox" checked={showAssignedToo} onChange={(e) => setShowAssignedToo(e.target.checked)} />
              Also show members who already have a cabin (e.g. to give them a second, separate time slot)
            </label>
          )}
        </div>
        <div className="field">
          <label>Cabin</label>
          <select value={form.cabin_id} onChange={(e) => setForm({ ...form, cabin_id: e.target.value })} required>
            <option value="">Select cabin…</option>
            {cabins.map((c) => (
              <option key={c.id} value={c.id}>Cabin {c.cabin_number}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Hours Needed / Day</label>
          <input
            type="number"
            step="0.5"
            min="1"
            max="24"
            value={form.hours_needed}
            onChange={(e) => setForm({ ...form, hours_needed: e.target.value })}
            required
          />
        </div>
      </div>

      <label style={{ marginTop: 4 }}>
        Time Range(s) — pick 1 or 2, between {settings.operating_hours_start} and {settings.operating_hours_end}
      </label>
      {form.slots.map((slot, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 8, alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Start</label>
            <input
              type="time"
              value={slot.start_time}
              min={settings.operating_hours_start}
              max={settings.operating_hours_end}
              onChange={(e) => updateSlot(i, 'start_time', e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>End</label>
            <input
              type="time"
              value={slot.end_time}
              min={settings.operating_hours_start}
              max={settings.operating_hours_end}
              onChange={(e) => updateSlot(i, 'end_time', e.target.value)}
              required
            />
          </div>
          {form.slots.length > 1 && (
            <button type="button" className="btn secondary" onClick={() => removeSlot(i)}>Remove</button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        {form.slots.length < 2 ? (
          <button type="button" className="btn secondary" onClick={addSlot}>+ Add second range</button>
        ) : <span />}
        <span style={{ fontSize: '0.85rem', color: hoursMatch ? 'var(--green-700)' : 'var(--red)' }}>
          Selected total: {totalHours}h {hoursMatch ? '✓ matches' : `(needs ${form.hours_needed}h)`}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button type="button" className="btn secondary" onClick={handleSuggest} disabled={suggestBusy}>
          {suggestBusy ? 'Checking…' : '🔍 Find Best Available Cabin'}
        </button>
      </div>

      {suggestion && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--paper-2, #f7f5f0)' }}>
          {suggestion.best_cabin ? (
            <div style={{ marginBottom: 8 }}>
              <strong>Best pick: Cabin {suggestion.best_cabin.cabin_number}</strong>{' '}
              <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                (free for this time range, currently {suggestion.best_cabin.current_load} other booking{suggestion.best_cabin.current_load === 1 ? '' : 's'})
              </span>{' '}
              <button type="button" className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => applySuggestion(suggestion.best_cabin.id)}>
                Use this cabin
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>No cabin is fully free for this exact time range — see options below (mark Special Case to double up).</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestion.all_cabins.map((c) => (
              <button
                type="button"
                key={c.id}
                className="btn secondary"
                style={{ padding: '2px 8px', fontSize: '0.72rem', opacity: c.available ? 1 : 0.5 }}
                title={c.available ? `Free — ${c.current_load} other booking(s)` : `Busy: ${c.conflicting_ranges.join(', ')}`}
                onClick={() => applySuggestion(c.id)}
              >
                #{c.cabin_number} {c.available ? '✓' : '✕'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
        <div className="field">
          <label>Validity Start</label>
          <DateInputDMY value={form.validity_start} onChange={(v) => setForm({ ...form, validity_start: v })} />
        </div>
        <div className="field">
          <label>Validity End</label>
          <DateInputDMY value={form.validity_end} onChange={(v) => setForm({ ...form, validity_end: v })} />
        </div>
      </div>

      <div className="checkbox-row" style={{ marginTop: 4, marginBottom: 14 }}>
        <input
          type="checkbox"
          id="special-case"
          checked={form.is_special_case}
          onChange={(e) => setForm({ ...form, is_special_case: e.target.checked })}
        />
        <label htmlFor="special-case" style={{ margin: 0 }}>
          Special Case Assignment — allow this cabin + time range to have more than one active member.
          Existing members are never removed.
        </label>
      </div>

      {form.is_special_case && (
        <div className="field">
          <label>Reason for special case</label>
          <input
            value={form.special_case_reason}
            onChange={(e) => setForm({ ...form, special_case_reason: e.target.value })}
            placeholder="e.g. temporary overflow, admin override…"
            required
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="button" disabled={busy} onClick={handleAssignOnly}>
          {presetMemberId ? 'Assign / Change' : 'Assign'}
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy}
          style={{ background: 'var(--brass)', borderColor: 'var(--brass)' }}
          onClick={handleAssignAndBill}
        >
          Assign &amp; Bill
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}