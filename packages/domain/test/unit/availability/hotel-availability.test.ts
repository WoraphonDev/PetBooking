import { describe, expect, it } from "vitest";
import { hotelAvailability } from "../../../src/availability/hotel-availability.ts";

const unit = (id: string, status: "active" | "maintenance" | "archived" = "active") => ({
  id,
  code: id,
  roomTypeId: "rt",
  status,
  sortOrder: 1,
});
const stay = (roomUnitId: string, checkInDate: string, checkOutDate: string) => ({ roomUnitId, checkInDate, checkOutDate });

describe("hotelAvailability (extra cases beyond the vectors)", () => {
  it("counts units free for the whole range with reason ok", () => {
    const r = hotelAvailability({
      roomTypeId: "rt",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      units: [unit("A"), unit("B"), unit("C", "archived")],
      stays: [stay("A", "2026-10-11", "2026-10-13")],
    });
    expect(r).toEqual({
      availableUnits: 1,
      byNight: [
        { date: "2026-10-10", freeUnits: 2 },
        { date: "2026-10-11", freeUnits: 1 },
      ],
      reason: "ok",
    });
  });

  it("walks nights across month and year ends", () => {
    const r = hotelAvailability({ roomTypeId: "rt", checkInDate: "2026-12-30", checkOutDate: "2027-01-02", units: [unit("A")], stays: [] });
    expect(r.byNight.map((n) => n.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("ignores closures on the checkout day (not a night of the stay)", () => {
    const r = hotelAvailability({
      roomTypeId: "rt",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      units: [unit("A")],
      stays: [],
      closedDates: ["2026-10-12", "2026-10-09"],
    });
    expect(r).toMatchObject({ availableUnits: 1, reason: "ok" });
  });

  it("reports closed even when the room type is also full", () => {
    const r = hotelAvailability({
      roomTypeId: "rt",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-11",
      units: [unit("A")],
      stays: [stay("A", "2026-10-10", "2026-10-11")],
      closedDates: ["2026-10-10"],
    });
    expect(r).toEqual({ availableUnits: 0, byNight: [{ date: "2026-10-10", freeUnits: 0 }], reason: "closed" });
  });
});
