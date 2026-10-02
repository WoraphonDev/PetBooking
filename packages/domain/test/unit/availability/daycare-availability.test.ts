import { describe, expect, it } from "vitest";
import { daycareAvailability } from "../../../src/availability/daycare-availability.ts";

type Session = "full_day" | "morning" | "afternoon";
const types = (...t: [Session, number, string?][]) => t.map(([session, capacity, status = "active"]) => ({ session, capacity, status }));
const visits = (session: Session, n: number, status = "reserved") => Array.from({ length: n }, () => ({ session, status }));

describe("daycareAvailability (extra cases beyond the vectors)", () => {
  it("clamps overbooked sessions to 0", () => {
    expect(
      daycareAvailability({
        sessionTypes: types(["morning", 2], ["full_day", 5]),
        visits: [...visits("morning", 3), ...visits("full_day", 1)],
      }),
    ).toEqual({
      morning: 0,
      full_day: 0,
    });
  });

  it("omits inactive session types and does not let them limit full day", () => {
    const r = daycareAvailability({ sessionTypes: types(["full_day", 4], ["morning", 1, "archived"], ["afternoon", 10]), visits: [] });
    expect(r).toEqual({ full_day: 4, afternoon: 10 });
  });

  it("ignores cancelled and no-show visits but counts checked-out ones", () => {
    const r = daycareAvailability({
      sessionTypes: types(["afternoon", 5]),
      visits: [...visits("afternoon", 2, "cancelled"), ...visits("afternoon", 1, "no_show"), ...visits("afternoon", 1, "checked_out")],
    });
    expect(r).toEqual({ afternoon: 4 });
  });

  it("returns an empty object when nothing is offered", () => {
    expect(daycareAvailability({ sessionTypes: [], visits: [], closed: true })).toEqual({});
  });
});
