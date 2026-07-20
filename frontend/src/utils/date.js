// Centralised date display formatting - dd/mm/yyyy everywhere in the UI,
// regardless of the browser's locale (avoids the default en-US mm/dd/yyyy
// that toLocaleDateString() would otherwise produce for US-based browsers).
// For <input type="date"> values and "today" defaults - deliberately uses
// the browser's LOCAL date components, not toISOString() (which converts
// to UTC first). For anyone in India (UTC+5:30), converting to UTC before
// slicing the date would silently roll back to "yesterday" for the first
// ~5.5 hours after local midnight - exactly when a library might already
// be getting used for the day.
export function toLocalDateInput(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Same, plus hh:mm (24-hour) - used for audit logs / timestamps where the
// time of day matters, not just the date.
export function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} ${hh}:${min}`;
}
