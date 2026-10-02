import { describe, expect, it } from "vitest";
import { nextGroomDue } from "../../../src/aftercare/next-groom.ts";

const base = { shopIntervalDays: null, defaultDays: 28, hasFutureAppointment: false, petStatus: "active" as const };

describe("nextGroomDue (extra cases beyond the vectors)", () => {
  it("uses only the last 4 visits for the history median, whatever the input order", () => {
    // gaps of the last 4 visits: 10, 10, 10 (an older 100-day gap is ignored)
    const visitDates = ["2026-09-21", "2026-05-03", "2026-09-01", "2026-08-12", "2026-09-11"];
    expect(nextGroomDue({ ...base, visitDates })).toEqual({
      dueDate: "2026-10-01",
      remindOn: "2026-09-28",
      intervalDays: 10,
      source: "history",
    });
  });

  it("falls back to the default with a single gap of history", () => {
    expect(nextGroomDue({ ...base, visitDates: ["2026-08-01", "2026-09-01"] }).source).toBe("default");
  });

  it("ignores duplicate visit dates", () => {
    expect(nextGroomDue({ ...base, visitDates: ["2026-08-01", "2026-08-01", "2026-09-01"] }).source).toBe("default");
  });

  it("crosses month and year boundaries", () => {
    expect(nextGroomDue({ ...base, visitDates: ["2026-12-20"] })).toMatchObject({ dueDate: "2027-01-17", remindOn: "2027-01-14" });
  });

  it("suppresses the reminder for shop and history sources too", () => {
    expect(nextGroomDue({ ...base, shopIntervalDays: 21, hasFutureAppointment: true, visitDates: ["2026-09-01"] })).toEqual({
      dueDate: "2026-09-22",
      remindOn: null,
      intervalDays: 21,
      source: "shop:has_future_appointment",
    });
  });

  it("reports deceased pets as inactive even without visits", () => {
    expect(nextGroomDue({ ...base, petStatus: "deceased", visitDates: [] }).source).toBe("pet_inactive");
  });
});
