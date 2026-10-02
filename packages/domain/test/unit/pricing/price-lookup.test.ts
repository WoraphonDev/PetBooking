import { describe, expect, it } from "vitest";
import { lookupServicePrice } from "../../../src/pricing/price-lookup.ts";

const row = (sizeTierId: string | null, coatGroup: "short" | "long" | "any", priceSatang: number, serviceId = "svc") => ({
  serviceId,
  sizeTierId,
  coatGroup,
  priceSatang,
  durationMinutes: priceSatang / 1000,
});

describe("lookupServicePrice (extra cases beyond the vectors)", () => {
  it("uses the all-sizes coat row before the all-sizes any row", () => {
    const prices = [row(null, "any", 30000), row(null, "long", 40000)];
    expect(lookupServicePrice({ serviceId: "svc", sizeTierId: "t-s", coatGroup: "long", prices })).toEqual({
      priceSatang: 40000,
      durationMinutes: 40,
      matched: "all+coat",
    });
  });

  it("never matches a coat-specific row when the coat group is any", () => {
    const prices = [row("t-s", "long", 40000), row(null, "short", 20000)];
    expect(lookupServicePrice({ serviceId: "svc", sizeTierId: "t-s", coatGroup: "any", prices })).toBeNull();
  });

  it("never matches a tier row when the pet has no size tier", () => {
    expect(lookupServicePrice({ serviceId: "svc", sizeTierId: null, coatGroup: "short", prices: [row("t-s", "short", 40000)] })).toBeNull();
  });

  it("ignores rows of other services and of other tiers", () => {
    const prices = [row("t-s", "short", 99000, "other"), row("t-m", "short", 88000), row(null, "any", 30000)];
    expect(lookupServicePrice({ serviceId: "svc", sizeTierId: "t-s", coatGroup: "short", prices })?.matched).toBe("all+any");
  });
});
