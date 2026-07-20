// Extracts a clean 10-digit Indian mobile number from whatever the user
// typed or pasted (e.g. "+91 98765 43210", "091-9876543210", "9876543210"
// all become "9876543210"). We take the LAST 10 digits rather than the
// first, since any leading digits are a country/trunk code, not part of
// the number itself.
export function normalizeIndianMobile(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

export function isValidIndianMobile(contact) {
  return /^[6-9]\d{9}$/.test(contact || '');
}

// wa.me links require the full international number (country code + local
// number), unlike the 10-digit number we store - prepend 91 for India.
export function toWhatsAppNumber(contact) {
  const digits = normalizeIndianMobile(contact);
  return `91${digits}`;
}
