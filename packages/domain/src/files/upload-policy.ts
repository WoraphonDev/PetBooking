// R-25 — upload limits (04#R-25): server-side check of kind → allowed MIME types and max size.
// Per-kind table approved in Q-0022 (04 lists only the categories). 1 MB = 1,000,000 bytes, 1 KB = 1,000 bytes.
// Video duration (≤ 30 s) cannot be checked here — the client enforces it before upload.

const MB = 1_000_000;
const IMAGE = ["image/jpeg", "image/png", "image/webp"];

type Rule = { mime: string; maxBytes: number };
const image = (maxBytes: number): Rule[] => IMAGE.map((mime) => ({ mime, maxBytes }));

const RULES: Record<string, Rule[]> = {
  // slips / general photos 2 MB
  pet_profile: image(2 * MB),
  before: image(2 * MB),
  after: image(2 * MB),
  slip: image(2 * MB),
  logo: image(2 * MB),
  room_photo: image(2 * MB),
  service_photo: image(2 * MB),
  feedback: image(2 * MB),
  proof: image(2 * MB),
  // stay updates: photos 2 MB or a video 20 MB
  stay_update: [...image(2 * MB), { mime: "video/mp4", maxBytes: 20 * MB }],
  // vaccine documents 5 MB (photo or PDF)
  vaccine_proof: [...image(5 * MB), { mime: "application/pdf", maxBytes: 5 * MB }],
  // signature PNG 500 KB
  signature: [{ mime: "image/png", maxBytes: 500_000 }],
  // CSV import 2 MB
  import_csv: [{ mime: "text/csv", maxBytes: 2 * MB }],
  consent_pdf: [{ mime: "application/pdf", maxBytes: 5 * MB }],
};

export function validateUpload(input: { kind: string; mimeType: string; sizeBytes: number }): { ok: boolean; error: string | null } {
  // 2. kind → MIME / max size
  const rules = Object.hasOwn(RULES, input.kind) ? RULES[input.kind] : undefined;
  if (!rules) return { ok: false, error: "UPLOAD_KIND_NOT_ALLOWED" };
  const rule = rules.find((r) => r.mime === input.mimeType.toLowerCase());
  if (!rule) return { ok: false, error: "UPLOAD_TYPE_NOT_ALLOWED" };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > rule.maxBytes) {
    return { ok: false, error: "UPLOAD_TOO_LARGE" };
  }
  return { ok: true, error: null };
}
