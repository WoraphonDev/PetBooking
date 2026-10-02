import { describe, expect, it } from "vitest";
import { quoteBooking } from "../../../src/pricing/quote.ts";

describe("quoteBooking (extra cases beyond the vectors)", () => {
  it("returns an all-zero estimate for an empty booking", () => {
    expect(quoteBooking({ bufferMinutes: 10 })).toEqual({ groom: [], stays: [], daycareTotalSatang: 0, estimatedTotalSatang: 0 });
  });

  it("uses the given quantity for one-off stay add-ons and ignores it for per-day ones", () => {
    const r = quoteBooking({
      bufferMinutes: 0,
      stays: [
        {
          checkInDate: "2026-10-30",
          checkOutDate: "2026-11-02",
          nightlyPriceSatang: 1000,
          addons: [
            { unitPriceSatang: 100, perDay: false, quantity: 2 },
            { unitPriceSatang: 10, perDay: true, quantity: 99 },
          ],
        },
      ],
    });
    expect(r).toMatchObject({
      stays: [
        {
          nights: 3,
          roomTotalSatang: 3000,
          addons: [
            { quantity: 2, totalSatang: 200 },
            { quantity: 3, totalSatang: 30 },
          ],
          addonsTotalSatang: 230,
        },
      ],
      estimatedTotalSatang: 3230,
    });
  });

  it("counts nights across a year end and rejects check-out before check-in", () => {
    expect(
      quoteBooking({ bufferMinutes: 0, stays: [{ checkInDate: "2026-12-31", checkOutDate: "2027-01-01", nightlyPriceSatang: 1 }] }),
    ).toMatchObject({
      stays: [{ nights: 1 }],
    });
    expect(
      quoteBooking({ bufferMinutes: 0, stays: [{ checkInDate: "2026-10-12", checkOutDate: "2026-10-10", nightlyPriceSatang: 1 }] }),
    ).toEqual({
      error: "INVALID_DATE_RANGE",
    });
  });

  it("sums several daycare visits", () => {
    expect(quoteBooking({ bufferMinutes: 0, daycare: [{ priceSatang: 30000 }, { priceSatang: 25000 }] })).toMatchObject({
      daycareTotalSatang: 55000,
      estimatedTotalSatang: 55000,
    });
  });
});
