// R-20 edge cases beyond docs/spec/vectors/R-20.*.json (vectors run in test/vectors.test.ts).
import { describe, expect, it } from "vitest";
import { localDayBounds, localToUtc, toLocalDate } from "../../../src/time/local-time.ts";

const TZ = "Asia/Bangkok";

describe("toLocalDate", () => {
  it("local midnight boundary: 16:59:59.999Z is still the same day, 17:00Z is the next", () => {
    expect(toLocalDate({ instant: "2026-10-05T16:59:59.999Z", timezone: TZ })).toBe("2026-10-05");
    expect(toLocalDate({ instant: "2026-10-05T17:00:00.000Z", timezone: TZ })).toBe("2026-10-06");
  });

  it("year rollover", () => {
    expect(toLocalDate({ instant: "2026-12-31T17:00:00.000Z", timezone: TZ })).toBe("2027-01-01");
  });

  it("accepts an instant with an explicit offset", () => {
    expect(toLocalDate({ instant: "2026-10-06T00:30:00+07:00", timezone: TZ })).toBe("2026-10-06");
  });

  it("uses the given timezone, not the process timezone", () => {
    expect(toLocalDate({ instant: "2026-10-05T23:00:00.000Z", timezone: "UTC" })).toBe("2026-10-05");
    expect(toLocalDate({ instant: "2026-10-05T23:00:00.000Z", timezone: TZ })).toBe("2026-10-06");
  });

  it("rejects an invalid instant or timezone", () => {
    expect(() => toLocalDate({ instant: "not-a-date", timezone: TZ })).toThrow(RangeError);
    expect(() => toLocalDate({ instant: "2026-10-05T02:00:00.000Z", timezone: "Mars/Olympus" })).toThrow(RangeError);
  });
});

describe("localToUtc", () => {
  it("23:59 local", () => {
    expect(localToUtc({ date: "2026-10-05", time: "23:59", timezone: TZ })).toBe("2026-10-05T16:59:00.000Z");
  });

  it("first of the year crosses back into the previous UTC year", () => {
    expect(localToUtc({ date: "2027-01-01", time: "00:00", timezone: TZ })).toBe("2026-12-31T17:00:00.000Z");
  });

  it("round-trips with toLocalDate", () => {
    const instant = localToUtc({ date: "2028-02-29", time: "06:15", timezone: TZ });
    expect(toLocalDate({ instant, timezone: TZ })).toBe("2028-02-29");
  });

  it("rejects malformed or out-of-range date/time", () => {
    expect(() => localToUtc({ date: "2026-02-30", time: "09:00", timezone: TZ })).toThrow(RangeError);
    expect(() => localToUtc({ date: "2026-10-5", time: "09:00", timezone: TZ })).toThrow(RangeError);
    expect(() => localToUtc({ date: "2026-10-05", time: "24:00", timezone: TZ })).toThrow(RangeError);
    expect(() => localToUtc({ date: "2026-10-05", time: "9:00", timezone: TZ })).toThrow(RangeError);
    expect(() => localToUtc({ date: "2026-10-05", time: "09:00", timezone: "Mars/Olympus" })).toThrow(RangeError);
  });
});

describe("localDayBounds", () => {
  it("end of month rolls into the next month", () => {
    expect(localDayBounds({ date: "2026-10-31", timezone: TZ })).toStrictEqual({
      start: "2026-10-30T17:00:00.000Z",
      end: "2026-10-31T17:00:00.000Z",
    });
  });

  it("DST zone: the spring-forward day is 23 hours long", () => {
    const { start, end } = localDayBounds({ date: "2026-03-08", timezone: "America/New_York" });
    expect(start).toBe("2026-03-08T05:00:00.000Z");
    expect(end).toBe("2026-03-09T04:00:00.000Z");
  });
});
