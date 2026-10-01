// R-18 edge cases beyond docs/spec/vectors/R-18.decideLinePush.json (vectors run in test/vectors.test.ts).
import { describe, expect, it } from "vitest";
import { decideLinePush } from "../../../src/notify/line-quota.ts";

type Input = Parameters<typeof decideLinePush>[0];
const base: Input = { monthlyQuota: 300, usedThisMonth: 0, messageClass: "helpful", economyMode: false, economyBehavior: "send" };
const decide = (over: Partial<Input>) => decideLinePush({ ...base, ...over });

const SEND = { send: true, skipReason: null };
const QUOTA = { send: false, skipReason: "quota_exhausted" };
const ECONOMY = { send: false, skipReason: "economy_mode" };

describe("decideLinePush", () => {
  it("quota exhausted wins over economy mode and applies to every class", () => {
    expect(decide({ usedThisMonth: 300, economyMode: true, economyBehavior: "skip" })).toEqual(QUOTA);
    for (const messageClass of ["essential", "helpful", "marketing"] as const) {
      expect(decide({ usedThisMonth: 301, messageClass })).toEqual(QUOTA);
    }
  });

  it("zero quota → never sends", () => {
    expect(decide({ monthlyQuota: 0, usedThisMonth: 0, messageClass: "essential" })).toEqual(QUOTA);
  });

  it("essential sends up to the last message", () => {
    expect(decide({ usedThisMonth: 299, messageClass: "essential" })).toEqual(SEND);
  });

  it("economy skip applies to essential too; economyBehavior=skip without economy mode does nothing", () => {
    expect(decide({ messageClass: "essential", economyMode: true, economyBehavior: "skip" })).toEqual(ECONOMY);
    expect(decide({ economyMode: false, economyBehavior: "skip" })).toEqual(SEND);
  });

  it("helpful just below 90% still sends", () => {
    expect(decide({ usedThisMonth: 269 })).toEqual(SEND);
  });

  it("thresholds use exact integer math (no float rounding)", () => {
    // quota 7: 70% = 4.9 → used 4 sends, used 5 skips; 90% = 6.3 → used 6 sends
    expect(decide({ monthlyQuota: 7, usedThisMonth: 4, messageClass: "marketing" })).toEqual(SEND);
    expect(decide({ monthlyQuota: 7, usedThisMonth: 5, messageClass: "marketing" })).toEqual(QUOTA);
    expect(decide({ monthlyQuota: 7, usedThisMonth: 6, messageClass: "helpful" })).toEqual(SEND);
    // quota 10: exactly 70% / 90% are already "reached"
    expect(decide({ monthlyQuota: 10, usedThisMonth: 7, messageClass: "marketing" })).toEqual(QUOTA);
    expect(decide({ monthlyQuota: 10, usedThisMonth: 9, messageClass: "helpful" })).toEqual(QUOTA);
  });
});
