import { describe, expect, it } from "vitest";
import { customerSelfService } from "../../../src/booking/self-service.ts";

const base = {
  now: "2026-10-07T03:00:00.000Z",
  firstServiceAt: "2026-10-10T03:00:00.000Z",
  status: "confirmed",
  rescheduleCutoffHours: 24,
  rescheduleCount: 0,
};

describe("customerSelfService (extra cases beyond the vectors)", () => {
  it("allows rescheduling exactly at the cutoff but not one millisecond after", () => {
    expect(customerSelfService({ ...base, now: "2026-10-09T03:00:00.000Z" }).canReschedule).toBe(true);
    expect(customerSelfService({ ...base, now: "2026-10-09T03:00:00.001Z" }).rescheduleBlockedReason).toBe("TOO_LATE_TO_RESCHEDULE");
  });

  it("stops cancelling at the start time itself", () => {
    expect(customerSelfService({ ...base, now: base.firstServiceAt }).canCancel).toBe(false);
  });

  it("lets awaiting_approval reschedule and deposit_review only cancel", () => {
    expect(customerSelfService({ ...base, status: "awaiting_approval" })).toEqual({
      canCancel: true,
      canReschedule: true,
      rescheduleBlockedReason: null,
    });
    expect(customerSelfService({ ...base, status: "deposit_review" })).toEqual({
      canCancel: true,
      canReschedule: false,
      rescheduleBlockedReason: "STATUS_NOT_ALLOWED",
    });
  });

  it("allows nothing for finished or cancelled bookings, reporting status first", () => {
    for (const status of ["cancelled", "expired", "closed"]) {
      expect(customerSelfService({ ...base, status, rescheduleCount: 5 })).toEqual({
        canCancel: false,
        canReschedule: false,
        rescheduleBlockedReason: "STATUS_NOT_ALLOWED",
      });
    }
  });

  it("reports the cutoff before the limit", () => {
    expect(customerSelfService({ ...base, now: "2026-10-09T05:00:00.000Z", rescheduleCount: 2 }).rescheduleBlockedReason).toBe(
      "TOO_LATE_TO_RESCHEDULE",
    );
  });
});
