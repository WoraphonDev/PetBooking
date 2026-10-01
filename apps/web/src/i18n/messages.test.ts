// i18n wiring: enum labels stay identical to the spec, merged messages have one namespace per file, helpers re-export R-22/R-31.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enumLabel } from "../lib/enum-label.ts";
import { formatPhone, formatTHB, formatThaiDate, formatTime, formatWeight } from "../lib/format.ts";

const readJson = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const TH_DIR = new URL("./messages/th/", import.meta.url);

describe("messages/th", () => {
  it("enum.json is an exact copy of docs/spec/enum-labels.th.json", () => {
    const spec = readJson(new URL("../../../../docs/spec/enum-labels.th.json", import.meta.url));
    expect(readJson(new URL("enum.json", TH_DIR))).toStrictEqual(spec.enum);
  });

  it("th.generated.json has one namespace per messages/th/*.json file (pretest runs merge-messages)", () => {
    const merged = readJson(new URL("./messages/th.generated.json", import.meta.url));
    const files = readdirSync(TH_DIR).filter((f) => f.endsWith(".json"));
    expect(Object.keys(merged).sort()).toStrictEqual(files.map((f) => f.slice(0, -".json".length)).sort());
    for (const f of files) expect(merged[f.slice(0, -".json".length)]).toStrictEqual(readJson(new URL(f, TH_DIR)));
  });
});

describe("enumLabel", () => {
  it("returns the Thai label", () => {
    expect(enumLabel("staff_role", "owner")).toBe("เจ้าของร้าน");
    expect(enumLabel("species", "cat")).toBe("แมว");
  });

  it("falls back to the raw value for an unknown value", () => {
    expect(enumLabel("species", "dragon" as "dog")).toBe("dragon");
  });
});

describe("lib/format", () => {
  it("re-exports the domain formatters", () => {
    expect(formatTHB({ satang: 123_450 })).toBe("฿1,234.50");
    expect(formatThaiDate({ date: "2026-10-05", withWeekday: true })).toBe("จ. 5 ต.ค. 2569");
    expect(formatTime({ instant: "2026-10-05T07:30:00.000Z", timezone: "Asia/Bangkok" })).toBe("14:30 น.");
    expect(formatWeight({ grams: 5_250 })).toBe("5.3 กก.");
    expect(formatPhone({ e164: "+66812345678" })).toBe("081-234-5678");
  });
});
