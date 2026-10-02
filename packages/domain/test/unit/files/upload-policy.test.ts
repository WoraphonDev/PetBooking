import { describe, expect, it } from "vitest";
import { validateUpload } from "../../../src/files/upload-policy.ts";

const ok = { ok: true, error: null };
const err = (error: string) => ({ ok: false, error });
const MB = 1_000_000;

describe("validateUpload (Q-0022 table, beyond the vectors)", () => {
  it("accepts every file_kind with at least one MIME type", () => {
    const kinds = [
      "pet_profile",
      "before",
      "after",
      "stay_update",
      "vaccine_proof",
      "slip",
      "signature",
      "consent_pdf",
      "logo",
      "room_photo",
      "service_photo",
      "feedback",
      "import_csv",
      "proof",
    ];
    const sample: Record<string, string> = { signature: "image/png", import_csv: "text/csv", consent_pdf: "application/pdf" };
    for (const kind of kinds) expect(validateUpload({ kind, mimeType: sample[kind] ?? "image/jpeg", sizeBytes: 1000 }), kind).toEqual(ok);
  });

  it("uses inclusive maximums in decimal megabytes", () => {
    expect(validateUpload({ kind: "slip", mimeType: "image/png", sizeBytes: 2 * MB })).toEqual(ok);
    expect(validateUpload({ kind: "slip", mimeType: "image/png", sizeBytes: 2 * MB + 1 })).toEqual(err("UPLOAD_TOO_LARGE"));
    expect(validateUpload({ kind: "vaccine_proof", mimeType: "image/jpeg", sizeBytes: 5 * MB })).toEqual(ok);
    expect(validateUpload({ kind: "stay_update", mimeType: "video/mp4", sizeBytes: 20 * MB + 1 })).toEqual(err("UPLOAD_TOO_LARGE"));
    expect(validateUpload({ kind: "signature", mimeType: "image/png", sizeBytes: 500_001 })).toEqual(err("UPLOAD_TOO_LARGE"));
  });

  it("applies the size limit of the matched MIME type (stay_update photo 2 MB, video 20 MB)", () => {
    expect(validateUpload({ kind: "stay_update", mimeType: "image/jpeg", sizeBytes: 3 * MB })).toEqual(err("UPLOAD_TOO_LARGE"));
    expect(validateUpload({ kind: "stay_update", mimeType: "video/mp4", sizeBytes: 3 * MB })).toEqual(ok);
  });

  it("restricts MIME types per kind", () => {
    expect(validateUpload({ kind: "signature", mimeType: "image/jpeg", sizeBytes: 1000 })).toEqual(err("UPLOAD_TYPE_NOT_ALLOWED"));
    expect(validateUpload({ kind: "import_csv", mimeType: "application/pdf", sizeBytes: 1000 })).toEqual(err("UPLOAD_TYPE_NOT_ALLOWED"));
    expect(validateUpload({ kind: "after", mimeType: "image/gif", sizeBytes: 1000 })).toEqual(err("UPLOAD_TYPE_NOT_ALLOWED"));
    expect(validateUpload({ kind: "after", mimeType: "IMAGE/JPEG", sizeBytes: 1000 })).toEqual(ok);
  });

  it("rejects empty or non-integer sizes and prototype keys as kinds", () => {
    expect(validateUpload({ kind: "after", mimeType: "image/jpeg", sizeBytes: 0 })).toEqual(err("UPLOAD_TOO_LARGE"));
    expect(validateUpload({ kind: "after", mimeType: "image/jpeg", sizeBytes: 1.5 })).toEqual(err("UPLOAD_TOO_LARGE"));
    expect(validateUpload({ kind: "toString", mimeType: "image/jpeg", sizeBytes: 1 })).toEqual(err("UPLOAD_KIND_NOT_ALLOWED"));
  });
});
