import { describe, expect, it } from "vitest";
import { computeBookingDeadlines } from "../../../src/booking/deadlines.ts";

const base = {
  createdAt: "2026-12-31T23:50:00.000Z",
  depositRequiredSatang: 1,
  requiresApproval: true,
  holdMinutes: 15,
  approvalTimeoutMinutes: 120,
};

describe("computeBookingDeadlines (extra cases beyond the vectors)", () => {
  it("crosses day and year boundaries in UTC", () => {
    expect(computeBookingDeadlines(base)).toEqual({ holdExpiresAt: "2027-01-01T00:05:00.000Z", approvalDueAt: "2027-01-01T01:50:00.000Z" });
  });

  it("normalizes a non-UTC offset instant to a UTC ISO string", () => {
    expect(computeBookingDeadlines({ ...base, createdAt: "2026-10-05T10:00:00+07:00" }).holdExpiresAt).toBe("2026-10-05T03:15:00.000Z");
  });

  it("rejects an invalid instant", () => {
    expect(() => computeBookingDeadlines({ ...base, createdAt: "yesterday" })).toThrow(RangeError);
  });
});
