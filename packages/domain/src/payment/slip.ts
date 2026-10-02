// R-05 — read the mini-QR on a Thai bank slip and detect re-used slips (04#R-05). Detects duplicates only; it never
// proves the money arrived — the shop always checks its account.

type SlipQr = { bankCode: string | null; transRef: string; crcValid: boolean } | null;

/** top-level EMVCo-style TLV (2-digit tag + 2-digit length); null when the string is not well-formed TLV */
function parseTlv(s: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const len = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len)) return null;
    const value = s.slice(i + 4, i + 4 + Number(len));
    if (value.length !== Number(len)) return null;
    out.set(tag, value);
    i += 4 + Number(len);
  }
  return out;
}

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 upper-case hex digits */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function parseSlipQr(input: { payload: string }): SlipQr {
  const payload = input.payload.trim();
  // 2. outer TLV must carry tag 00 (slip data) and tag 91 (CRC)
  const top = parseTlv(payload);
  const data = top?.get("00");
  const crc = top?.get("91");
  if (data === undefined || crc === undefined) return null;
  // inside tag 00: 01 = sender bank code, 02 = transaction reference
  const sub = parseTlv(data);
  const transRef = sub?.get("02");
  if (!sub || transRef === undefined) return null;
  // 3. a CRC mismatch is flagged, not rejected (Q-0026)
  return { bankCode: sub.get("01") ?? null, transRef, crcValid: crc16(payload.slice(0, -4)) === crc.toUpperCase() };
}

export function findDuplicateSlip(input: {
  transRef: string | null;
  existing: { id: string; transRef: string | null; status: "submitted" | "verified" | "rejected"; createdAt: string }[];
}): { duplicateOfSlipId: string | null } {
  // 1. no QR read → nothing to compare
  if (!input.transRef) return { duplicateOfSlipId: null };
  // 4. earliest non-rejected slip of the organization with the same reference
  const match = input.existing
    .filter((s) => s.transRef === input.transRef && s.status !== "rejected")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
  return { duplicateOfSlipId: match?.id ?? null };
}
