// Converts a 24hr "HH:MM" (or "HH:MM:SS") string to a 12hr "h:MM AM/PM"
// display string. Internal storage/logic everywhere else stays 24hr -
// this is purely for what's shown on screen.
export function formatTime12h(t) {
  if (!t) return '';
  const [hStr, mStr] = t.slice(0, 5).split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

export function formatRange12h(start, end) {
  return `${formatTime12h(start)} – ${formatTime12h(end)}`;
}