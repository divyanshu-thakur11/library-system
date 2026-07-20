import { useEffect, useRef, useState } from 'react';

// Type-to-search, click-to-select member picker. Unlike a native <select>
// with a filter box above it (which still needs opening the dropdown and
// finding the right option), this shows matching results directly below
// the search box - click one and it's selected immediately.
export default function MemberPicker({ members, value, onChange, placeholder = 'Search by name or Member ID…', excludeIds }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = members.find((m) => m.id === value) || null;

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? members
        .filter((m) => !excludeIds?.has(m.id))
        .filter((m) => m.name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q))
        .slice(0, 30)
    : [];

  function pick(m) {
    onChange(m.id);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {selected ? (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', background: '#fff',
          }}
        >
          <span>
            {selected.member_code} — {selected.name}
            {selected.status === 'inactive' && (
              <span className="badge inactive" style={{ marginLeft: 8 }}>inactive</span>
            )}
          </span>
          <button
            type="button"
            className="btn secondary"
            style={{ padding: '2px 8px', fontSize: '0.72rem' }}
            onClick={() => { onChange(''); setQuery(''); }}
          >
            Change
          </button>
        </div>
      ) : (
        <input
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && !selected && results.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)', marginTop: 4, maxHeight: 240, overflowY: 'auto',
          }}
        >
          {results.map((m) => (
            <div
              key={m.id}
              onClick={() => pick(m)}
              style={{ padding: '8px 10px', cursor: 'pointer', fontSize: '0.88rem', borderBottom: '1px solid var(--line-soft)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-sunken)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <strong>{m.member_code}</strong> — {m.name}
              {m.status === 'inactive' && <span className="badge inactive" style={{ marginLeft: 6 }}>inactive</span>}
            </div>
          ))}
        </div>
      )}
      {open && !selected && q && results.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
          No matches.
        </div>
      )}
    </div>
  );
}