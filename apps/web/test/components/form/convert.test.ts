import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bahtToSatang, gramsToKgText, kgToGrams, phoneValue, satangToBahtText } from "../../../src/components/shared/form/index.ts";

type PhoneCase = { name: string; input: { input: string }; expected: { e164: string | null; error: string | null } };
const phoneCases: PhoneCase[] = JSON.parse(
  readFileSync(new URL("../../../../../docs/spec/vectors/R-22.normalizePhone.json", import.meta.url), "utf8"),
).cases;

describe("MoneyInput conversion (บาท → สตางค์)", () => {
  it.each([
    ["0", 0],
    ["500", 50000],
    ["1,234.5", 123450],
    ["1234.56", 123456],
    ["0.05", 5],
    ["12.", 1200],
    ["  99  ", 9900],
  ])("%s → %d satang", (text, satang) => expect(bahtToSatang(text)).toBe(satang));

  it("empty is null; negative, 3 decimals, bad grouping or text are invalid", () => {
    expect(bahtToSatang("")).toBeNull();
    for (const bad of ["-5", "1.234", "12,34", "abc", "1e3", "฿5"]) expect(bahtToSatang(bad), bad).toBeUndefined();
  });

  it("round-trips satang to editable baht text", () => {
    expect(satangToBahtText(null)).toBe("");
    expect(satangToBahtText(150000)).toBe("1500");
    expect(satangToBahtText(12345)).toBe("123.45");
    expect(satangToBahtText(5)).toBe("0.05");
    for (const s of [0, 5, 1200, 123456]) expect(bahtToSatang(satangToBahtText(s))).toBe(s);
  });
});

describe("WeightInput conversion (กก. 1 ตำแหน่ง → กรัม)", () => {
  it.each([
    ["4.5", 4500],
    ["4", 4000],
    ["0.3", 300],
    ["25.", 25000],
  ])("%s kg → %d g", (text, grams) => expect(kgToGrams(text)).toBe(grams));

  it("empty is null; more than one decimal, negative or text are invalid", () => {
    expect(kgToGrams(" ")).toBeNull();
    for (const bad of ["4.55", "-1", "abc", "1,000"]) expect(kgToGrams(bad), bad).toBeUndefined();
  });

  it("shows grams as kg with one decimal, half up like formatWeight", () => {
    expect(gramsToKgText(null)).toBe("");
    expect(gramsToKgText(4500)).toBe("4.5");
    expect(gramsToKgText(4000)).toBe("4");
    expect(gramsToKgText(4449)).toBe("4.4");
    expect(gramsToKgText(4450)).toBe("4.5");
  });
});

describe("PhoneInput value (R-22)", () => {
  it.each(phoneCases.map((c) => [c.name, c] as const))("%s", (_, c) => expect(phoneValue(c.input.input)).toEqual(c.expected));

  it("treats an empty field as no phone, not invalid", () => {
    expect(phoneValue("   ")).toEqual({ e164: null, error: null });
  });
});
