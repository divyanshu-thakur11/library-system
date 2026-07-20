// Tracks "already sent today" per WhatsApp button, scoped to this browser.
// Uses localStorage since this is a real deployed app (not a sandboxed
// preview) - it's fine here. Each button gets a unique key (e.g.
// `overdue:${memberId}`) so the same member showing up in two different
// sections (say, Overdue and Follow-ups) is tracked independently.
const PREFIX = 'waSentTracker:';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function wasSentToday(key) {
  try {
    return localStorage.getItem(PREFIX + key) === todayStr();
  } catch {
    return false;
  }
}

export function markSentToday(key) {
  try {
    localStorage.setItem(PREFIX + key, todayStr());
  } catch {
    // localStorage unavailable (private browsing etc) - fail silently,
    // the button just won't remember across reloads this session.
  }
}

export function clearSent(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // no-op
  }
}