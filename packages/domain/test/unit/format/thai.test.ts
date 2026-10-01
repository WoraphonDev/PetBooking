// R-31 edge cases beyond docs/spec/vectors/R-31.*.json (vectors run in test/vectors.test.ts).
import { describe, expect, it } from "vitest";
import { formatTHB, formatThaiDate, formatTime, formatWeight } from "../../../src/format/thai.ts";

describe("formatTHB", () => {
  it("groups thousands", () => {
    expect(formatTHB({ satang: 99_900 })).toBe("฿999");
    expect(formatTHB({ satang: 100_000 })).toBe("฿1,000");
    expect(formatTHB({ satang: 123_456_789_00 })).toBe("฿123,456,789");
  });

  it("pads single-digit satang", () => {
    expect(formatTHB({ satang: 100_005 })).toBe("฿1,000.05");
    expect(formatTHB({ satang: 1 })).toBe("฿0.01");
  });

  it("always shows .00, including zero and negatives", () => {
    expect(formatTHB({ satang: 0, decimals: "always" })).toBe("฿0.00");
    expect(formatTHB({ satang: -123_450, decimals: "always" })).toBe("-฿1,234.50");
  });

  it("explicit auto behaves like the default", () => {
    expect(formatTHB({ satang: 50_000, decimals: "auto" })).toBe("฿500");
  });

  it("rejects non-integer satang", () => {
    expect(() => formatTHB({ satang: 12.5 })).toThrow(RangeError);
  });
});

describe("formatThaiDate", () => {
  it("every month abbreviation", () => {
    const got = Array.from({ length: 12 }, (_, i) => formatThaiDate({ date: `2027-${String(i + 1).padStart(2, "0")}-01` }));
    expect(got).toStrictEqual([
      "1 ม.ค. 2570",
      "1 ก.พ. 2570",
      "1 มี.ค. 2570",
      "1 เม.ย. 2570",
      "1 พ.ค. 2570",
      "1 มิ.ย. 2570",
      "1 ก.ค. 2570",
      "1 ส.ค. 2570",
      "1 ก.ย. 2570",
      "1 ต.ค. 2570",
      "1 พ.ย. 2570",
      "1 ธ.ค. 2570",
    ]);
  });

  it("every weekday abbreviation (2026-10-04 is a Sunday)", () => {
    const got = Array.from(
      { length: 7 },
      (_, i) => formatThaiDate({ date: `2026-10-${String(4 + i).padStart(2, "0")}`, withWeekday: true }).split(" ")[0],
    );
    expect(got).toStrictEqual(["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]);
  });

  it("withWeekday false is the plain form", () => {
    expect(formatThaiDate({ date: "2028-02-29", withWeekday: false })).toBe("29 ก.พ. 2571");
  });

  it("rejects malformed or impossible dates", () => {
    expect(() => formatThaiDate({ date: "2026-02-29" })).toThrow(RangeError);
    expect(() => formatThaiDate({ date: "2026-10-5" })).toThrow(RangeError);
  });
});

describe("formatTime", () => {
  it("zero-pads and uses 24h", () => {
    expect(formatTime({ instant: "2026-10-05T01:05:00.000Z", timezone: "Asia/Bangkok" })).toBe("08:05 น.");
    expect(formatTime({ instant: "2026-10-05T17:00:00.000Z", timezone: "Asia/Bangkok" })).toBe("00:00 น.");
  });

  it("follows the given timezone", () => {
    expect(formatTime({ instant: "2026-10-05T07:30:00.000Z", timezone: "UTC" })).toBe("07:30 น.");
  });

  it("rejects an invalid instant or timezone", () => {
    expect(() => formatTime({ instant: "nope", timezone: "Asia/Bangkok" })).toThrow(RangeError);
    expect(() => formatTime({ instant: "2026-10-05T07:30:00.000Z", timezone: "Mars/Olympus" })).toThrow(RangeError);
  });
});

describe("formatWeight", () => {
  it("rounds half up at the boundary", () => {
    expect(formatWeight({ grams: 5_249 })).toBe("5.2 กก.");
    expect(formatWeight({ grams: 5_950 })).toBe("6 กก.");
    expect(formatWeight({ grams: 49 })).toBe("0 กก.");
    expect(formatWeight({ grams: 50 })).toBe("0.1 กก.");
  });

  it("rejects non-integer grams", () => {
    expect(() => formatWeight({ grams: 5_200.5 })).toThrow(RangeError);
  });
});
