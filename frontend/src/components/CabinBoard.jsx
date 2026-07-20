import { useState } from 'react';
import { hashColor } from '../utils/colors';
import { formatDate } from '../utils/date';
import { formatTime12h } from '../utils/time';
import DateInputDMY from './DateInputDMY';

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function fmt(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Sweep-line over every slot boundary within operating hours, so that
// overlapping slots (e.g. a normal booking plus a special-case booking on
// the same stretch) resolve to a single status per stretch of time:
// special-case beats occupied beats free.
function buildSegments(cabin, opStartMin, opEndMin) {
  const slots = cabin.time_slots || [];
  const points = new Set([opStartMin, opEndMin]);
  slots.forEach((s) => {
    points.add(Math.min(opEndMin, Math.max(opStartMin, timeToMinutes(s.start_time))));
    points.add(Math.min(opEndMin, Math.max(opStartMin, timeToMinutes(s.end_time))));
  });
  const bounds = [...points].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (end <= start) continue;
    const mid = (start + end) / 2;
    const covering = slots.filter((s) => timeToMinutes(s.start_time) <= mid && timeToMinutes(s.end_time) > mid);
    const specialOccupants = [];
    const normalOccupants = [];
    covering.forEach((s) => {
      (s.members || []).forEach((m) => {
        const occ = { ...m, slot_start: s.start_time, slot_end: s.end_time };
        if (m.is_special_case) specialOccupants.push(occ);
        else normalOccupants.push(occ);
      });
    });
    let status = 'free';
    if (specialOccupants.length > 0) status = 'special';
    else if (normalOccupants.length > 0) status = 'occupied';
    segments.push({ start, end, status });
  }
  return segments;
}

function buildGridlines(opStartMin, opEndMin) {
  const lines = [];
  let t = Math.ceil(opStartMin / 60) * 60;
  for (; t < opEndMin; t += 60) {
    if (t > opStartMin) lines.push(t);
  }
  return lines;
}

function OccupantSlotRow({ occupant, slot }) {
  return (
    <div className="member-chip" style={{ marginTop: 2 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
        {formatTime12h(slot.start)} – {formatTime12h(slot.end)}
        {slot.is_special_case && <span className="badge special" style={{ marginLeft: 6 }} title={occupant.special_case_reason}>Special</span>}
      </span>
    </div>
  );
}

function MemberGroup({ group, onEnd, onChangeMember, onEditValidity }) {
  const [editingValidity, setEditingValidity] = useState(false);
  const [validityForm, setValidityForm] = useState({ validity_start: '', validity_end: '' });
  const [savingValidity, setSavingValidity] = useState(false);

  function startEditValidity() {
    setValidityForm({
      validity_start: group.validity_start ? group.validity_start.slice(0, 10) : '',
      validity_end: group.validity_end ? group.validity_end.slice(0, 10) : '',
    });
    setEditingValidity(true);
  }

  async function saveValidity() {
    setSavingValidity(true);
    try {
      await onEditValidity(group.member_id, validityForm);
      setEditingValidity(false);
    } finally {
      setSavingValidity(false);
    }
  }

  return (
    <div
      className="occupant-row"
      style={{
        border: group.has_due ? '2px solid var(--red)' : group.is_overdue ? '2px solid #b5651d' : undefined,
        background: group.has_due
          ? 'repeating-linear-gradient(135deg, var(--red-soft), var(--red-soft) 10px, #fff 10px, #fff 20px)'
          : group.is_overdue
          ? '#fdf1e6'
          : undefined,
        boxShadow: group.has_due ? '0 0 8px rgba(163,64,47,0.35)' : group.is_overdue ? '0 0 8px rgba(181,101,29,0.3)' : undefined,
      }}
    >
      <div>
        <strong style={{ color: hashColor(group.member_id) }}>{group.member_code}</strong> — {group.member_name}
        {group.has_due && (
          <span
            className="badge"
            style={{ marginLeft: 6, background: 'var(--red)', color: '#fff', fontWeight: 700 }}
            title="This member has an unpaid balance"
          >
            FEE DUE
          </span>
        )}
        {group.is_overdue && (
          <span
            className="badge"
            style={{ marginLeft: 6, background: '#b5651d', color: '#fff', fontWeight: 700 }}
            title="This member's validity has already expired"
          >
            OVERDUE
          </span>
        )}
      </div>
      {group.slots.map((slot) => (
        <OccupantSlotRow key={slot.id} occupant={group} slot={slot} />
      ))}

      {editingValidity ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'end', flexWrap: 'wrap', marginTop: 6, padding: 8, background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.68rem' }}>Validity Start</label>
            <DateInputDMY value={validityForm.validity_start} onChange={(v) => setValidityForm({ ...validityForm, validity_start: v })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.68rem' }}>Validity End</label>
            <DateInputDMY value={validityForm.validity_end} onChange={(v) => setValidityForm({ ...validityForm, validity_end: v })} />
          </div>
          <button className="btn secondary" style={{ padding: '4px 10px' }} disabled={savingValidity} onClick={saveValidity}>
            {savingValidity ? 'Saving…' : 'Save'}
          </button>
          <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingValidity(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          Validity: {formatDate(group.validity_start)} to {formatDate(group.validity_end)}
          {onEditValidity && (
            <button className="btn secondary" style={{ padding: '1px 6px', fontSize: '0.66rem' }} onClick={startEditValidity}>
              Edit Validity
            </button>
          )}
        </div>
      )}

      {(onEnd || onChangeMember) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {group.slots.map((slot) =>
            slot.ended_at ? (
              <span key={slot.id} className="badge inactive" style={{ fontSize: '0.68rem' }}>
                {formatTime12h(slot.start)} — Ended earlier today
              </span>
            ) : (
              <div key={slot.id} style={{ display: 'flex', gap: 6 }}>
                {onChangeMember && (
                  <button
                    className="btn secondary"
                    style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                    title={`Move the ${formatTime12h(slot.start)}–${formatTime12h(slot.end)} slot to a different cabin/time`}
                    onClick={() => onChangeMember({ id: slot.id, member_id: group.member_id, member_name: group.member_name, validity_start: group.validity_start, validity_end: group.validity_end })}
                  >
                    Assign / Change ({formatTime12h(slot.start)})
                  </button>
                )}
                {onEnd && (
                  <button className="btn secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => onEnd(slot.id)}>
                    End ({formatTime12h(slot.start)})
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CabinCard({ cabin, opStartMin, opEndMin, onEnd, onChangeMember, onEditValidity }) {
  const allOccupants = (cabin.time_slots || []).flatMap((s) =>
    (s.members || []).map((m) => ({ ...m, slot_start: s.start_time, slot_end: s.end_time }))
  );
  const uniqueOccupants = allOccupants.filter((occ, idx, arr) => arr.findIndex((o) => o.id === occ.id) === idx);

  if (uniqueOccupants.length === 0) {
    return (
      <div className="cabin-tile cabin-vacant">
        <div className="cabin-number">
          Cabin {cabin.cabin_number}
          <span className="cabin-vacant-badge">Fully Vacant</span>
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: 10 }}>
          No member is using this cabin during operating hours ({formatTime12h(fmt(opStartMin))}–{formatTime12h(fmt(opEndMin))}).
        </div>
      </div>
    );
  }

  const segments = buildSegments(cabin, opStartMin, opEndMin);
  const totalMinutes = opEndMin - opStartMin || 1;
  const gridlines = buildGridlines(opStartMin, opEndMin);
  const fullyOccupied = segments.length > 0 && segments.every((seg) => seg.status !== 'free');

  // Group every occupant's slots together under one card, so a member with
  // two time ranges shows both together instead of being split apart.
  const byMember = {};
  uniqueOccupants.forEach((occ) => {
    if (!byMember[occ.member_id]) {
      byMember[occ.member_id] = {
        member_id: occ.member_id,
        member_code: occ.member_code,
        member_name: occ.member_name,
        validity_start: occ.validity_start,
        validity_end: occ.validity_end,
        has_due: occ.has_due,
        is_overdue: occ.is_overdue,
        special_case_reason: occ.special_case_reason,
        slots: [],
      };
    }
    byMember[occ.member_id].slots.push({
      id: occ.id,
      start: occ.slot_start,
      end: occ.slot_end,
      is_special_case: occ.is_special_case,
      ended_at: occ.ended_at || null,
    });
  });
  const memberGroups = Object.values(byMember).sort((a, b) => a.member_name.localeCompare(b.member_name));

  return (
    <div className={`cabin-tile ${fullyOccupied ? 'cabin-fully-occupied' : ''}`}>
      <div className="cabin-number">
        Cabin {cabin.cabin_number}
        {fullyOccupied && <span className="cabin-vacant-badge" style={{ background: 'var(--green-500)', borderColor: 'var(--green-700)', color: '#fff' }}>Fully Occupied</span>}
      </div>

      <div style={{ position: 'relative' }}>
        <div className="timeline-bar" style={{ position: 'relative', height: 22 }}>
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`timeline-segment seg-${seg.status}`}
              style={{ width: `${((seg.end - seg.start) / totalMinutes) * 100}%` }}
              title={`${formatTime12h(fmt(seg.start))}–${formatTime12h(fmt(seg.end))} · ${seg.status === 'free' ? 'Free' : seg.status === 'special' ? 'Special Case' : 'Occupied'}`}
            />
          ))}
          {gridlines.map((t) => (
            <div
              key={t}
              style={{
                position: 'absolute',
                left: `${((t - opStartMin) / totalMinutes) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.5)',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>

        {/* Compact text breakdown - guaranteed readable regardless of how
            thin a segment renders on screen, unlike labels placed inside
            the bar itself which get squeezed out on short segments. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
          {segments.map((seg, i) => (
            <span
              key={i}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                lineHeight: 1.4,
                padding: '1px 5px',
                borderRadius: 3,
                background: seg.status === 'free' ? 'var(--green-soft, #e2ede6)' : seg.status === 'special' ? 'var(--amber-soft)' : 'var(--red-soft)',
                color: seg.status === 'free' ? 'var(--green-700)' : seg.status === 'special' ? 'var(--amber)' : 'var(--red)',
              }}
            >
              {formatTime12h(fmt(seg.start))}–{formatTime12h(fmt(seg.end))}
              {seg.status !== 'free' && (seg.status === 'special' ? ' Special' : '')}
            </span>
          ))}
        </div>
      </div>

      {memberGroups.map((group) => (
        <MemberGroup key={group.member_id} group={group} onEnd={onEnd} onChangeMember={onChangeMember} onEditValidity={onEditValidity} />
      ))}
    </div>
  );
}

export default function CabinBoard({ cabins, onEnd, onChangeMember, onEditValidity, operatingHours }) {
  const opStartMin = timeToMinutes(operatingHours?.start || '06:00');
  const opEndMin = timeToMinutes(operatingHours?.end || '23:00');

  return (
    <div className="cabin-board">
      {cabins.map((cabin) => (
        <CabinCard
          key={cabin.id}
          cabin={cabin}
          opStartMin={opStartMin}
          opEndMin={opEndMin}
          onEnd={onEnd}
          onChangeMember={onChangeMember}
          onEditValidity={onEditValidity}
        />
      ))}
    </div>
  );
}