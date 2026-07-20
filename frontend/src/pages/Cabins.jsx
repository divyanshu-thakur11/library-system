import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import CabinBoard from '../components/CabinBoard';
import CabinAssignForm from '../components/CabinAssignForm';

function ManageCabins({ cabins, onChanged }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role !== 'admin') return null;

  async function addCabin() {
    setError('');
    setBusy(true);
    try {
      await api.post('/cabins', {});
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCabin(cabin) {
    if (!confirm(`Remove Cabin ${cabin.cabin_number}? This only works if it has never been assigned.`)) return;
    setError('');
    try {
      await api.del(`/cabins/${cabin.id}`);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(cabin) {
    setError('');
    try {
      await api.patch(`/cabins/${cabin.id}/status`, { is_active: !cabin.is_active });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Manage Cabins ({cabins.length} total)</h2>
        <button className="btn secondary" onClick={addCabin} disabled={busy}>
          + Add Cabin
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
        {cabins.map((c) => (
          <div key={c.id} className="checkbox-row" style={{ padding: '4px 8px', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>#{c.cabin_number}</span>
            <button className="btn secondary" style={{ padding: '1px 6px', fontSize: '0.68rem' }} onClick={() => toggleActive(c)}>
              {c.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button className="btn secondary" style={{ padding: '1px 6px', fontSize: '0.68rem' }} onClick={() => removeCabin(c)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Cabins() {
  const [cabins, setCabins] = useState([]);
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({ operating_hours_start: '06:00', operating_hours_end: '23:00' });
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [presetMemberId, setPresetMemberId] = useState('');
  const [presetValidity, setPresetValidity] = useState(null);

  async function loadBoard() {
    const data = await api.get('/cabins/view').catch((e) => {
      setError(e.message);
      return { cabins: [] };
    });
    setCabins(data.cabins);
  }

  useEffect(() => {
    loadBoard();
    api.get('/members', { status: 'active' }).then((d) => setMembers(d.members)).catch(() => {});
    api.get('/settings').then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  // Coming from Renewal tab's "Change Cabin" - pre-fill the member and
  // starting validity date, then open the assign form directly.
  useEffect(() => {
    const pending = sessionStorage.getItem('renewalCabinPrefill');
    if (!pending) return;
    sessionStorage.removeItem('renewalCabinPrefill');
    try {
      const { member_id, validity_start } = JSON.parse(pending);
      setPresetMemberId(member_id);
      setPresetValidity({ start: validity_start || '', end: '' });
      setAssignOpen(true);
    } catch {
      // malformed sessionStorage value - ignore
    }
  }, []);

  // Just updates validity dates directly - no cabin/assignment change at
  // all. For renewing an existing member without touching their cabin.
  async function handleEditValidity(memberId, { validity_start, validity_end }) {
    setError('');
    try {
      await api.patch(`/members/${memberId}`, {
        validity_start: validity_start || null,
        validity_end: validity_end || null,
      });
      loadBoard();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleEnd(assignmentId) {
    if (!confirm('End this assignment? The member will be removed from this slot.')) return;
    setError('');
    try {
      await api.patch(`/assignments/${assignmentId}/end`);
      loadBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  // "Change Cabin / Timing": end the member's current assignment for that
  // slot and open the shared assign form pre-filled with their details.
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
      loadBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Cabins</div>
          <h1>Cabin View</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn secondary" onClick={() => setManageOpen((s) => !s)}>
            {manageOpen ? 'Hide Manage' : 'Manage Cabins'}
          </button>
          <button
            className="btn"
            onClick={() => {
              setPresetMemberId('');
              setPresetValidity(null);
              setAssignOpen((s) => !s);
            }}
          >
            {assignOpen ? 'Cancel' : '+ Assign Cabin'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {manageOpen && <ManageCabins cabins={cabins} onChanged={loadBoard} />}

      {assignOpen && (
        <CabinAssignForm
          cabins={cabins}
          members={members}
          assignedMemberIds={
            new Set(
              cabins.flatMap((c) => (c.time_slots || []).flatMap((s) => (s.members || []).map((m) => m.member_id)))
            )
          }
          settings={settings}
          presetMemberId={presetMemberId}
          presetValidity={presetValidity}
          onAssigned={() => {
            setAssignOpen(false);
            setPresetMemberId('');
            setPresetValidity(null);
            loadBoard();
          }}
          onCancel={() => setAssignOpen(false)}
        />
      )}

      <div className="calendar-legend" style={{ flexWrap: 'wrap' }}>
        <span><span className="dot" style={{ background: 'var(--green-500)' }} /> Free (in bar)</span>
        <span><span className="dot" style={{ background: 'var(--red)' }} /> Occupied (in bar)</span>
        <span><span className="dot" style={{ background: 'var(--amber)' }} /> Special Case (in bar)</span>
        <span><span className="dot" style={{ background: 'var(--blue)' }} /> Fully Vacant Cabin</span>
        <span><span className="dot" style={{ background: 'var(--green-500)', border: '2px solid var(--green-700)' }} /> Fully Occupied Cabin — every hour of operating hours is booked</span>
        <span style={{ fontWeight: 700, color: 'var(--red)', background: 'var(--red-soft)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--red)' }}>
          ⚠ Red outline + striped background = FEE DUE (unpaid balance)
        </span>
        <span style={{ fontWeight: 700, color: '#b5651d', background: '#fdf1e6', padding: '2px 8px', borderRadius: 4, border: '1px solid #b5651d' }}>
          ⚠ Orange outline = OVERDUE (membership validity expired)
        </span>
      </div>

      <CabinBoard
        cabins={cabins}
        onEnd={handleEnd}
        onChangeMember={handleChangeMember}
        onEditValidity={handleEditValidity}
        operatingHours={{ start: settings.operating_hours_start, end: settings.operating_hours_end }}
      />
    </div>
  );
}