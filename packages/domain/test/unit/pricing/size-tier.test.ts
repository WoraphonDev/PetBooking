import { describe, expect, it } from "vitest";
import { resolveSizeTier } from "../../../src/pricing/size-tier.ts";

const dog = (id: string, min: number, max: number | null) => ({
  id,
  species: "dog" as const,
  code: id,
  minWeightGrams: min,
  maxWeightGrams: max,
});

describe("resolveSizeTier (extra cases beyond the vectors)", () => {
  it("sorts tiers by min before matching, whatever the input order", () => {
    const tiers = [dog("l", 12000, null), dog("s", 0, 6000), dog("m", 6000, 12000)];
    expect(resolveSizeTier({ species: "dog", weightGrams: 5999, tiers })).toEqual({ tierId: "s", reason: "matched" });
    expect(resolveSizeTier({ species: "dog", weightGrams: 12000, tiers })).toEqual({ tierId: "l", reason: "matched" });
  });

  it("returns no_tier for a weight in a gap or below the first tier", () => {
    const tiers = [dog("s", 1000, 5000), dog("l", 8000, null)];
    expect(resolveSizeTier({ species: "dog", weightGrams: 6000, tiers })).toEqual({ tierId: null, reason: "no_tier" });
    expect(resolveSizeTier({ species: "dog", weightGrams: 500, tiers })).toEqual({ tierId: null, reason: "no_tier" });
  });

  it("checks no_weight before tiers but after species other", () => {
    expect(resolveSizeTier({ species: "dog", weightGrams: null, tiers: [] })).toEqual({ tierId: null, reason: "no_weight" });
    expect(resolveSizeTier({ species: "other", weightGrams: null, tiers: [dog("s", 0, null)] })).toEqual({
      tierId: null,
      reason: "no_tier",
    });
  });

  it("does not mutate the input tiers", () => {
    const tiers = [dog("l", 12000, null), dog("s", 0, 12000)];
    resolveSizeTier({ species: "dog", weightGrams: 100, tiers });
    expect(tiers.map((t) => t.id)).toEqual(["l", "s"]);
  });
});
