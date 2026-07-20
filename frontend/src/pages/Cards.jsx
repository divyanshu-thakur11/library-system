import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { toWhatsAppNumber } from '../utils/phone';
import { formatDate } from '../utils/date';

function buildWhatsAppMessage(card) {
  const slots = card.time_slots.map((s) => `${s.label} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})`).join(', ');
  return (
    `Shiv Shakti Library — Member Card\n` +
    `Registration No: ${card.member_code}\n` +
    `Cabin No: ${card.cabin_numbers.join(', ') || '—'}\n` +
    `Name: ${card.name}\n` +
    `Father's Name: ${card.father_name || '—'}\n` +
    `Address: ${card.address || '—'}\n` +
    `Mobile: ${card.contact}\n` +
    `Registration Date: ${formatDate(card.registration_date)}\n` +
    `Validity: ${formatDate(card.validity_start)} to ${formatDate(card.validity_end)}\n` +
    `Time Slot(s): ${slots || '—'}`
  );
}

export default function Cards() {
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/members', { status: 'active' }).then((d) => setMembers(d.members)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!memberId) { setCard(null); return; }
    api.get(`/members/${memberId}/card`).then(setCard).catch((e) => setError(e.message));
  }, [memberId]);

  const waLink = card ? `https://wa.me/${toWhatsAppNumber(card.contact)}?text=${encodeURIComponent(buildWhatsAppMessage(card))}` : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Members</div>
          <h1>Member Cards</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card no-print">
        <div className="field" style={{ maxWidth: 380 }}>
          <label>Select Member</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Choose a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.member_code} — {m.name}</option>)}
          </select>
        </div>
      </div>

      {card && (
        <>
          <div className="member-card">
            {card.photo_data && (
              <img
                src={card.photo_data}
                alt={card.name}
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--green-900)', float: 'right', marginLeft: 12 }}
              />
            )}
            <div className="card-top-row">
              <span>Reg. No: {card.member_code}</span>
              <span>Cabin No: {card.cabin_numbers.join(', ') || '—'}</span>
            </div>
            <div className="card-name">{card.name}</div>
            <div className="card-line">Father's Name: {card.father_name || '—'}</div>
            <div className="card-line">Address: {card.address || '—'}</div>
            <div className="card-mobile-row">
              <span>Mobile No: {card.contact}</span>
            </div>
            <table>
              <thead>
                <tr><th>Registration Date</th><th>Validity</th><th>Time Slot(s)</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{formatDate(card.registration_date)}</td>
                  <td>
                    {formatDate(card.validity_start)}
                    {' – '}
                    {formatDate(card.validity_end)}
                  </td>
                  <td>
                    {card.time_slots.length === 0 && '—'}
                    {card.time_slots.map((s, i) => (
                      <div key={i}>
                        Cabin {s.cabin_number} · {s.label} ({s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)})
                        {s.is_special_case && <span className="badge special" style={{ marginLeft: 6 }}>Special Case</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="no-print" style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <a className="btn" href={waLink} target="_blank" rel="noreferrer">Send via WhatsApp</a>
            <button className="btn secondary" onClick={() => window.print()}>Print Card</button>
          </div>
        </>
      )}
    </div>
  );
}