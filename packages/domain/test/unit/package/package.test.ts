import { describe, expect, it } from "vitest";
import { canRedeemPackage, packageTerms } from "../../../src/package/package.ts";

const pkg = {
  status: "active",
  sessionsUsed: 0,
  sessionsTotal: 5,
  expiresAt: "2027-10-05T16:59:59.999Z",
  serviceId: "svc",
  sizeTierId: null,
  shareScope: "single_pet" as const,
  petId: "p-1",
};
const appointment = { serviceId: "svc", sizeTierId: "t-m", petId: "p-1" };

describe("packageTerms (extra cases beyond the vectors)", () => {
  it("expires at the end of the same local day for 0 validity days and crosses a leap day", () => {
    expect(
      packageTerms({
        priceSatang: 100,
        sessionsCount: 1,
        validityDays: 0,
        purchasedAt: "2026-10-05T03:00:00.000Z",
        timezone: "Asia/Bangkok",
      }).expiresAt,
    ).toBe("2026-10-05T16:59:59.999Z");
    expect(
      packageTerms({
        priceSatang: 100,
        sessionsCount: 1,
        validityDays: 1,
        purchasedAt: "2028-02-28T03:00:00.000Z",
        timezone: "Asia/Bangkok",
      }).expiresAt,
    ).toBe("2028-02-29T16:59:59.999Z");
  });

  it("rejects zero sessions", () => {
    expect(() =>
      packageTerms({
        priceSatang: 100,
        sessionsCount: 0,
        validityDays: 1,
        purchasedAt: "2026-10-05T03:00:00.000Z",
        timezone: "Asia/Bangkok",
      }),
    ).toThrow(RangeError);
  });
});

describe("canRedeemPackage (extra cases beyond the vectors)", () => {
  it("accepts any size when the package has no size tier", () => {
    expect(canRedeemPackage({ now: "2026-12-01T00:00:00.000Z", package: pkg, appointment })).toEqual({ ok: true, reason: null });
  });

  it("is still valid at the expiry instant itself", () => {
    expect(canRedeemPackage({ now: pkg.expiresAt, package: pkg, appointment }).ok).toBe(true);
  });

  it("reports the first failing check only", () => {
    const r = canRedeemPackage({
      now: "2028-01-01T00:00:00.000Z",
      package: { ...pkg, status: "exhausted", sessionsUsed: 5 },
      appointment: { ...appointment, serviceId: "x" },
    });
    expect(r).toEqual({ ok: false, reason: "PACKAGE_NOT_ACTIVE" });
    const r2 = canRedeemPackage({
      now: "2028-01-01T00:00:00.000Z",
      package: { ...pkg, sessionsUsed: 5 },
      appointment: { ...appointment, serviceId: "x" },
    });
    expect(r2.reason).toBe("PACKAGE_EXHAUSTED");
  });

  it("treats a single-pet package without a pet as not matching any pet", () => {
    expect(canRedeemPackage({ now: "2026-12-01T00:00:00.000Z", package: { ...pkg, petId: null }, appointment }).reason).toBe(
      "PACKAGE_PET_MISMATCH",
    );
  });
});
