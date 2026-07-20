// Capitalizes the first letter of every word as it's typed, without
// fighting the user's cursor position or forcing lowercase on the rest
// (so "McDonald" or "O'Brien" typed deliberately aren't mangled - this
// only fixes the first letter of each word, it doesn't lowercase what's
// already there).
export function titleCaseOnType(value) {
  return value.replace(/(^|\s)([a-z])/g, (match, boundary, letter) => boundary + letter.toUpperCase());
}