import { describe, expect, it } from "vitest";
import { nextBookingNo } from "../../../src/ids/booking-no.ts";

describe("nextBookingNo (extra cases beyond the vectors)", () => {
  it("starts at 0001 for a branch whose counter was never used (month '')", () => {
    expect(nextBookingNo({ now: "2026-10-05T03:00:00.000Z", timezone: "Asia/Bangkok", counter: { month: "", nextSeq: 1 } })).toEqual({
      bookingNo: "B6910-0001",
      counter: { month: "6910", nextSeq: 2 },
    });
  });

  it("rolls the Buddhist Era year at local new year", () => {
    // 2027-01-01 00:10 Bangkok = BE 2570
    const r = nextBookingNo({ now: "2026-12-31T17:10:00.000Z", timezone: "Asia/Bangkok", counter: { month: "6912", nextSeq: 77 } });
    expect(r).toEqual({ bookingNo: "B7001-0001", counter: { month: "7001", nextSeq: 2 } });
  });

  it("keeps the current month just before local midnight", () => {
    const r = nextBookingNo({ now: "2026-10-31T16:59:59.999Z", timezone: "Asia/Bangkok", counter: { month: "6910", nextSeq: 5 } });
    expect(r.bookingNo).toBe("B6910-0005");
  });
});
