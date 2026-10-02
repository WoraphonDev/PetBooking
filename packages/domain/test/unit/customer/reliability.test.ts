import { describe, expect, it } from "vitest";
import { computeReliability } from "../../../src/customer/reliability.ts";

const c = (noShowCount12m: number, lateCancelCount12m: number, completedVisits12m: number, override: 1 | 2 | 3 | 4 | null = null) =>
  computeReliability({ noShowCount12m, lateCancelCount12m, completedVisits12m, override });

describe("computeReliability (extra cases beyond the vectors)", () => {
  it("keeps high risk ahead of a long visit history", () => {
    expect(c(2, 0, 50).level).toBe(1);
    expect(c(1, 3, 50).level).toBe(1);
  });

  it("puts one no-show or two+ late cancels on watch regardless of visits", () => {
    expect(c(1, 1, 20).level).toBe(2);
    expect(c(0, 5, 20).level).toBe(2);
  });

  it("needs at least 5 completed visits for level 4", () => {
    expect(c(0, 0, 4).level).toBe(3);
    expect(c(0, 0, 5).level).toBe(4);
  });

  it("returns any override as is, including a better level than computed", () => {
    expect(c(5, 5, 0, 4)).toEqual({ level: 4, source: "override" });
    expect(c(0, 0, 9, 1)).toEqual({ level: 1, source: "override" });
  });
});
