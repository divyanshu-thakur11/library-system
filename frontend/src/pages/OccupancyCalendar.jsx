import { useEffect, useState } from 'react';
import { api } from '../api/client';
import CabinBoard from '../components/CabinBoard';
import CabinAssignForm from '../components/CabinAssignForm';
import { toLocalDateInput } from '../utils/date';

export default function OccupancyCalendar() {
  const [date, setDate] = useState(toLocalDateInput());
  const [cabins, setCabins] = useState([]);
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({ operating_hours_start: '06:00', operating_hours_end: '23:00' });
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [presetMemberId, setPresetMemberId] = useState('');
  const [presetValidity, setPresetValidity] = useState(null);

  const isToday = date === toLocalDateInput(new Date());

  async function load(d) {
    const data = await api.get('/cabins/occupancy', { date: d }).catch((e) => {
      setError(e.message);
      return { cabins: [] };
    });
    setCabins(data.cabins);
  }

  useEffect(() => { load(date); }, [date]);

  useEffect(() => {
    api.get('/members', { status: 'active' }).then((d) => setMembers(d.members)).catch(() => {});
    api.get('/settings').then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  function shiftDay(delta) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(toLocalDateInput(d));
  }

  // Changing a cabin/timing only makes sense against the live board, so
  // it's only offered while looking at today.
  async function handleEnd(assignmentId) {
    if (!confirm('End this assignment? The member will be removed from this slot.')) return;
    setError('');
    try {
      await api.patch(`/assignments/${assignmentId}/end`);
      load(date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleChangeMember(occupant) {
    if (!confirm(`Move ${occupant.member_name} out of this slot so you can reassign them?`)) return;
    setError('');
    try {
      await api.patch(`/assignments/${occupant.id}/end`);
      setPresetValidity({
        start: occupant.validity_start ? occupant.validity_start.slice(0, 10) : '',
        end: occupant.validity_end ? occupant.validity_end.slice(0, 10) : '',
      });
      setPresetMemberId(occupant.member_id);
      setAssignOpen(true);
      load(date);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalSlots = cabins.reduce((sum, c) => sum + c.time_slots.length, 0);
  const occupiedSlots = cabins.reduce((sum, c) => sum + c.time_slots.filter((s) => s.members.length > 0).length, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Cabins</div>
          <h1>Occupancy Calendar</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="btn secondary" onClick={() => shiftDay(-1)}>← Prev Day</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
        <button className="btn secondary" onClick={() => shiftDay(1)}>Next Day →</button>
        <button className="btn secondary" onClick={() => setDate(toLocalDateInput(new Date()))}>Today</button>
        <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
          {occupiedSlots}/{totalSlots} time ranges occupied on {date}
        </div>
      </div>

      {!isToday && (
        <div className="checkbox-row" style={{ marginBottom: 14 }}>
          Cabin/timing changes can only be made on today's view — jump to Today to make changes.
        </div>
      )}

      {assignOpen && isToday && (
        <CabinAssignForm
          cabins={cabins}
          members={members}
          settings={settings}
          presetMemberId={presetMemberId}
          presetValidity={presetValidity}
          onAssigned={() => {
            setAssignOpen(false);
            setPresetMemberId('');
            setPresetValidity(null);
            load(date);
          }}
          onCancel={() => setAssignOpen(false)}
        />
      )}

      <div className="calendar-legend" style={{ flexWrap: 'wrap' }}>
        <span><span className="dot" style={{ background: 'var(--green-500)' }} /> Free</span>
        <span><span className="dot" style={{ background: 'var(--red)' }} /> Occupied</span>
        <span><span className="dot" style={{ background: 'var(--amber)' }} /> Special Case</span>
        <span><span className="dot" style={{ background: 'var(--blue)' }} /> Fully Vacant Cabin</span>
        <span style={{ fontWeight: 700, color: 'var(--red)', background: 'var(--red-soft)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--red)' }}>
          ⚠ Red outline + striped background = FEE DUE (unpaid balance)
        </span>
        <span style={{ fontWeight: 700, color: '#b5651d', background: '#fdf1e6', padding: '2px 8px', borderRadius: 4, border: '1px solid #b5651d' }}>
          ⚠ Orange outline = OVERDUE (membership validity expired)
        </span>
      </div>

      <CabinBoard
        cabins={cabins}
        onEnd={isToday ? handleEnd : undefined}
        onChangeMember={isToday ? handleChangeMember : undefined}
        operatingHours={{ start: settings.operating_hours_start, end: settings.operating_hours_end }}
      />
    </div>
  );
}