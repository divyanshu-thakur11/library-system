import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { toWhatsAppNumber } from '../utils/phone';
import { formatDate } from '../utils/date';

function daysLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function birthdayMessage(name) {
  return `Hi ${name}, wishing you a very Happy Birthday from all of us at Shiv Shakti Library! 🎉📚`;
}

function BirthdaysModal({ members, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 25, 15, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 520, width: '92%', maxHeight: '80vh', overflowY: 'auto', background: 'var(--paper-raised)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1.1rem' }}>🎂 Birthdays — Today &amp; Next 3 Days</h2>
          <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={onClose}>Close</button>
        </div>

        {members.length === 0 && (
          <div style={{ color: 'var(--ink-soft)' }}>No birthdays today or in the next 3 days.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map((m) => {
            const isToday = m.days_until === 0;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius)',
                  background: isToday ? 'var(--amber-soft, #f6ecd8)' : 'transparent',
                  border: isToday ? '1px solid var(--brass)' : '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: isToday ? 700 : 400 }}>
                    {m.name} <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>({m.member_code})</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', fontWeight: isToday ? 600 : 400 }}>
                    {daysLabel(m.days_until)} — {formatDate(m.date_of_birth)}
                  </div>
                </div>
                {m.contact ? (
                  <a
                    className="btn secondary"
                    style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    href={`https://wa.me/${toWhatsAppNumber(m.contact)}?text=${encodeURIComponent(birthdayMessage(m.name))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Send Wishes
                  </a>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>No contact</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [birthdays, setBirthdays] = useState([]);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/summary').then(setSummary).catch((e) => setError(e.message));
    api.get('/reports/birthdays', { within_days: 3 }).then((d) => setBirthdays(d.members)).catch(() => {});
  }, []);

  const todayCount = birthdays.filter((m) => m.days_until === 0).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Dashboard</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Total Collections</div>
            <div className="value">₹{summary.total_collections.toLocaleString('en-IN')}</div>
          </div>
          <div className="stat-card">
            <div className="label">Active Members</div>
            <div className="value">{summary.active_members}</div>
          </div>
          <div className="stat-card">
            <div className="label">Active Cabins</div>
            <div className="value">{summary.active_cabins}</div>
          </div>
          <div className="stat-card">
            <div className="label">Slot Occupancy</div>
            <div className="value">
              {summary.cabin_occupancy.occupied_slots}/{summary.cabin_occupancy.total_slots}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Special Case Assignments</div>
            <div className="value">{summary.special_case_assignments}</div>
          </div>
          <div className="stat-card">
            <div className="label">Expired Memberships</div>
            <div className="value">{summary.expired_memberships}</div>
          </div>
          <div
            className="stat-card"
            style={{ cursor: 'pointer', borderColor: todayCount > 0 ? 'var(--brass)' : undefined }}
            onClick={() => setShowBirthdays(true)}
            title="Click to see who's celebrating and send wishes"
          >
            <div className="label">🎂 Birthdays (Today + 3 Days)</div>
            <div className="value" style={{ color: todayCount > 0 ? 'var(--brass, #b8853a)' : 'inherit' }}>
              {birthdays.length}{todayCount > 0 ? ` (${todayCount} today)` : ''}
            </div>
          </div>
        </div>
      )}

      {showBirthdays && <BirthdaysModal members={birthdays} onClose={() => setShowBirthdays(false)} />}
    </div>
  );
}
