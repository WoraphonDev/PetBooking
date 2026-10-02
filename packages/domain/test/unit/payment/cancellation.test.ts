import { describe, expect, it } from "vitest";
import { computeCancellation } from "../../../src/payment/cancellation.ts";

const policySnapshot = {
  groomingFreeCancelHours: 24,
  hotelFreeCancelHours: 72,
  daycareFreeCancelHours: 12,
  lateCancelForfeitPercent: 50,
  cancelRefundMode: "refund" as const,
};
const base = {
  now: "2026-10-09T03:00:00.000Z",
  firstServiceAt: "2026-10-10T03:00:00.000Z",
  modules: ["daycare" as const],
  kind: "customer_cancel" as const,
  depositVerifiedSatang: 10001,
  policySnapshot,
};

describe("computeCancellation (extra cases beyond the vectors)", () => {
  it("uses the module's own window and the snapshot refund mode", () => {
    expect(computeCancellation(base)).toEqual({
      isLate: false,
      minutesBefore: 1440,
      freeCancelHours: 12,
      forfeitSatang: 0,
      returnSatang: 10001,
      returnMode: "refund",
    });
  });

  it("rounds the forfeit down so the customer gets the odd satang back", () => {
    const r = computeCancellation({ ...base, now: "2026-10-10T00:00:00.000Z" });
    expect(r).toMatchObject({ isLate: true, forfeitSatang: 5000, returnSatang: 5001, returnMode: "refund" });
  });

  it("defaults customer_choice to credit when the customer did not pick", () => {
    const r = computeCancellation({ ...base, policySnapshot: { ...policySnapshot, cancelRefundMode: "customer_choice" } });
    expect(r.returnMode).toBe("credit");
  });

  it("lets the customer take credit when the shop cancels", () => {
    expect(computeCancellation({ ...base, kind: "shop_cancel", customerChoice: "credit" })).toMatchObject({
      returnSatang: 10001,
      returnMode: "credit",
    });
  });

  it("floors partial minutes toward the past", () => {
    expect(computeCancellation({ ...base, now: "2026-10-10T03:00:30.000Z" }).minutesBefore).toBe(-1);
    expect(computeCancellation({ ...base, now: "2026-10-10T02:59:30.000Z" }).minutesBefore).toBe(0);
  });

  it("treats a 0% late forfeit as late with a full return", () => {
    const r = computeCancellation({
      ...base,
      now: "2026-10-10T00:00:00.000Z",
      policySnapshot: { ...policySnapshot, lateCancelForfeitPercent: 0 },
    });
    expect(r).toMatchObject({ isLate: true, forfeitSatang: 0, returnSatang: 10001 });
  });

  it("rejects an empty module list or a bad deposit", () => {
    expect(() => computeCancellation({ ...base, modules: [] })).toThrow(RangeError);
    expect(() => computeCancellation({ ...base, depositVerifiedSatang: -5 })).toThrow(RangeError);
  });
});
