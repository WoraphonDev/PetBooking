// Unit conversion for inputs (06 กติการ่วม): money typed in baht → integer satang; weight typed in kg (1 decimal) → grams.
// String arithmetic only — never floats for money (AGENTS rule 5).

const BAHT_RE = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{0,2}))?$/;
const KG_RE = /^(\d+)(?:\.(\d?))?$/;

/** "1,234.5" → 123450; empty → null; negative, > 2 decimals or not a number → undefined (invalid). */
export function bahtToSatang(text: string): number | null | undefined {
  const s = text.trim();
  if (s === "") return null;
  const m = BAHT_RE.exec(s);
  if (!m) return undefined;
  const satang = Number((m[1] ?? "").replaceAll(",", "")) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(satang) ? satang : undefined;
}

/** 123450 → "1234.50", 150000 → "1500" (editable text, no grouping). */
export function satangToBahtText(satang: number | null): string {
  if (satang === null) return "";
  const baht = Math.floor(satang / 100);
  const rest = satang % 100;
  return rest === 0 ? String(baht) : `${baht}.${String(rest).padStart(2, "0")}`;
}

/** "4.5" → 4500; empty → null; more than 1 decimal or not a number → undefined (invalid). */
export function kgToGrams(text: string): number | null | undefined {
  const s = text.trim();
  if (s === "") return null;
  const m = KG_RE.exec(s);
  if (!m) return undefined;
  return Number(m[1]) * 1000 + Number(m[2] || "0") * 100;
}

/** 4500 → "4.5", 4000 → "4" (1 decimal, half up — same rounding as formatWeight). */
export function gramsToKgText(grams: number | null): string {
  if (grams === null) return "";
  const tenths = Math.floor((grams + 50) / 100);
  return tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
