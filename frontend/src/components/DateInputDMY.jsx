import { useEffect, useRef, useState } from 'react';

function pad(n) {
  return String(n).padStart(2, '0');
}

// Native <input type="date"> silently follows the visitor's OS/browser
// locale (mm/dd/yyyy on a US-locale device, dd/mm/yyyy elsewhere) - there's
// no HTML attribute to force a display order. This is three plain number
// inputs instead, always in Day / Month / Year order, but still reading
// and writing the same "YYYY-MM-DD" string every other date field uses.
export default function DateInputDMY({ value, onChange }) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // Tracks the last value *we* emitted, so the sync effect below can tell
  // the difference between "the parent changed this externally" (needs to
  // re-sync) and "we just emitted this ourselves" (must NOT re-sync).
  // Without this, typing e.g. "12" into Month with Day/Year already
  // filled would emit after the "1", the parent's value prop would update,
  // this effect would fire and reset the Month field back to "01" - and
  // the "2" keystroke would then land on an already-reset field, silently
  // truncating the entry to the wrong month.
  const lastEmitted = useRef(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setYear(y);
      setMonth(m);
      setDay(d);
    } else if (!value) {
      setYear('');
      setMonth('');
      setDay('');
    }
  }, [value]);

  function emit(d, m, y) {
    if (d && m && y && y.length === 4) {
      const v = `${y}-${pad(m)}-${pad(d)}`;
      lastEmitted.current = v;
      onChange(v);
    } else if (!d && !m && !y) {
      lastEmitted.current = '';
      onChange('');
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        type="number"
        placeholder="DD"
        min="1"
        max="31"
        value={day}
        onChange={(e) => {
          const v = e.target.value.slice(0, 2);
          setDay(v);
          emit(v, month, year);
        }}
        style={{ width: 52 }}
      />
      <span style={{ color: 'var(--ink-soft)' }}>/</span>
      <input
        type="number"
        placeholder="MM"
        min="1"
        max="12"
        value={month}
        onChange={(e) => {
          const v = e.target.value.slice(0, 2);
          setMonth(v);
          emit(day, v, year);
        }}
        style={{ width: 52 }}
      />
      <span style={{ color: 'var(--ink-soft)' }}>/</span>
      <input
        type="number"
        placeholder="YYYY"
        min="2000"
        max="2100"
        value={year}
        onChange={(e) => {
          const v = e.target.value.slice(0, 4);
          setYear(v);
          emit(day, month, v);
        }}
        style={{ width: 68 }}
      />
    </div>
  );
}