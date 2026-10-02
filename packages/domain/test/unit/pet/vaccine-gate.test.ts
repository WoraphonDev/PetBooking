import { describe, expect, it } from "vitest";
import { checkVaccines } from "../../../src/pet/vaccine-gate.ts";

const v = (code: string, expiresOn: string, status: "pending_review" | "verified" | "rejected") => ({ code, expiresOn, status });

describe("checkVaccines (extra cases beyond the vectors)", () => {
  it("passes when any verified record is valid even if an older one expired", () => {
    const vaccinations = [v("DOG_RABIES", "2026-01-01", "verified"), v("DOG_RABIES", "2027-01-01", "verified")];
    expect(checkVaccines({ requiredCodes: ["DOG_RABIES"], vaccinations, mustBeValidOn: "2026-10-12" }).ok).toBe(true);
  });

  it("prefers a valid verified record over a pending one", () => {
    const vaccinations = [v("DOG_RABIES", "2027-01-01", "pending_review"), v("DOG_RABIES", "2027-01-01", "verified")];
    expect(checkVaccines({ requiredCodes: ["DOG_RABIES"], vaccinations, mustBeValidOn: "2026-10-12" }).pendingReview).toEqual([]);
  });

  it("treats an expired pending record (or expired verified + rejected) as expired", () => {
    const res = checkVaccines({
      requiredCodes: ["DOG_RABIES", "DOG_DHPPL"],
      vaccinations: [
        v("DOG_RABIES", "2026-10-01", "pending_review"),
        v("DOG_DHPPL", "2026-10-01", "verified"),
        v("DOG_DHPPL", "2027-10-01", "rejected"),
      ],
      mustBeValidOn: "2026-10-12",
    });
    expect(res).toEqual({ ok: false, missing: [], expired: ["DOG_RABIES", "DOG_DHPPL"], pendingReview: [] });
  });

  it("lists each problem in requiredCodes order", () => {
    const res = checkVaccines({
      requiredCodes: ["C", "B", "A"],
      vaccinations: [v("B", "2027-01-01", "pending_review")],
      mustBeValidOn: "2026-10-12",
    });
    expect(res).toEqual({ ok: false, missing: ["C", "A"], expired: [], pendingReview: ["B"] });
  });
});
