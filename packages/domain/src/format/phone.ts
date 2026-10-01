// R-22 — phone numbers (04#R-22): every phone column stores E.164 (+66812345678); search terms are normalized the same way.

const SEPARATORS_RE = /[\s\-()]/g;
/** Thai mobile: 9 digits after the trunk 0, starting with 6/8/9 */
const TH_MOBILE_RE = /^[689]\d{8}$/;
/** Thai landline: 8 digits after the trunk 0, starting with 2/3/4/5/7 */
const TH_LANDLINE_RE = /^[23457]\d{7}$/;
/** international (non-+66): + followed by 8–15 digits, stored as given */
const INTERNATIONAL_RE = /^\+\d{8,15}$/;

const INVALID = { e164: null, error: "INVALID_PHONE" } as const;

export function normalizePhone(input: { input: string }): { e164: string | null; error: "INVALID_PHONE" | null } {
  // 1. strip spaces, dashes, parentheses
  const s = input.input.replace(SEPARATORS_RE, "");

  // 1. accepted Thai shapes: 0X…, 66X…, +66X…, +66 0X… → national number without the trunk 0
  let national: string;
  if (s.startsWith("+66")) national = s.slice(3);
  else if (s.startsWith("66")) national = s.slice(2);
  else if (s.startsWith("0")) national = s;
  else if (s.startsWith("+")) {
    // 3. international: keep as is
    return INTERNATIONAL_RE.test(s) ? { e164: s, error: null } : INVALID;
  } else return INVALID;
  if (national.startsWith("0")) national = national.slice(1);

  // 2. Thai mobile or landline
  if (TH_MOBILE_RE.test(national) || TH_LANDLINE_RE.test(national)) return { e164: `+66${national}`, error: null };
  return INVALID;
}

export function formatPhone(input: { e164: string }): string {
  const { e164 } = input;
  if (!e164.startsWith("+66")) return e164; // 4. international → E.164 as stored
  const national = e164.slice(3);
  // 4. mobile 081-234-5678
  if (TH_MOBILE_RE.test(national)) return `0${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`;
  if (TH_LANDLINE_RE.test(national)) {
    // 4. Bangkok 02-123-4567
    if (national.startsWith("2")) return `0${national.slice(0, 1)}-${national.slice(1, 4)}-${national.slice(4)}`;
    // 4. provincial 038-123-456
    return `0${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`;
  }
  return e164; // not a valid stored Thai number — show it unchanged rather than mangle it
}
