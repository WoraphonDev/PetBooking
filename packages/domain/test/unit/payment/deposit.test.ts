import { describe, expect, it } from "vitest";
import { computeDeposit } from "../../../src/payment/deposit.ts";

const customer = { depositExempt: false, reliabilityLevel: 3 as const };

describe("computeDeposit (extra cases beyond the vectors)", () => {
  it("never asks more than the total when rounding up to whole baht", () => {
    expect(computeDeposit({ estimatedTotalSatang: 150, policy: { type: "percent", value: 100 }, customer })).toEqual({
      depositRequiredSatang: 150,
      reason: "policy_percent",
    });
    expect(
      computeDeposit({ estimatedTotalSatang: 150, policy: { type: "none", value: 0 }, customer: { ...customer, reliabilityLevel: 2 } }),
    ).toEqual({
      depositRequiredSatang: 100,
      reason: "reliability_min_30",
    });
  });

  it("keeps the policy when it equals the watch-level minimum", () => {
    expect(
      computeDeposit({
        estimatedTotalSatang: 100000,
        policy: { type: "fixed", value: 30000 },
        customer: { ...customer, reliabilityLevel: 2 },
      }),
    ).toEqual({
      depositRequiredSatang: 30000,
      reason: "policy_fixed",
    });
  });

  it("level 4 follows the policy like level 3", () => {
    expect(
      computeDeposit({
        estimatedTotalSatang: 85000,
        policy: { type: "percent", value: 30 },
        customer: { ...customer, reliabilityLevel: 4 },
      }),
    ).toEqual({
      depositRequiredSatang: 25500,
      reason: "policy_percent",
    });
  });

  it("returns 0 for an empty estimate, even at level 1", () => {
    expect(computeDeposit({ estimatedTotalSatang: 0, policy: { type: "fixed", value: 500 }, customer })).toEqual({
      depositRequiredSatang: 0,
      reason: "policy_fixed",
    });
    expect(
      computeDeposit({ estimatedTotalSatang: 0, policy: { type: "none", value: 0 }, customer: { ...customer, reliabilityLevel: 1 } }),
    ).toEqual({
      depositRequiredSatang: 0,
      reason: "reliability_full_prepay",
    });
  });

  it("rejects a negative or fractional total", () => {
    expect(() => computeDeposit({ estimatedTotalSatang: -1, policy: { type: "none", value: 0 }, customer })).toThrow(RangeError);
    expect(() => computeDeposit({ estimatedTotalSatang: 10.5, policy: { type: "none", value: 0 }, customer })).toThrow(RangeError);
  });
});
