// R-22 edge cases beyond docs/spec/vectors/R-22.*.json (vectors run in test/vectors.test.ts).
import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "../../../src/format/phone.ts";

const ok = (e164: string) => ({ e164, error: null });
const INVALID = { e164: null, error: "INVALID_PHONE" };
const norm = (input: string) => normalizePhone({ input });

describe("normalizePhone", () => {
  it("accepts every Thai mobile prefix 06/08/09", () => {
    expect(norm("0612345678")).toStrictEqual(ok("+66612345678"));
    expect(norm("0912345678")).toStrictEqual(ok("+66912345678"));
  });

  it("accepts every Thai landline prefix 02/03/04/05/07", () => {
    for (const p of ["2", "3", "4", "5", "7"]) expect(norm(`0${p}1234567`)).toStrictEqual(ok(`+66${p}1234567`));
  });

  it("66 with a trunk 0 and surrounding whitespace", () => {
    expect(norm("  66 081 234 5678 ")).toStrictEqual(ok("+66812345678"));
    expect(norm("+66(0)81-234-5678")).toStrictEqual(ok("+66812345678"));
  });

  it("rejects wrong lengths and prefixes", () => {
    expect(norm("08123456789")).toStrictEqual(INVALID); // mobile too long
    expect(norm("02123456")).toStrictEqual(INVALID); // landline too short
    expect(norm("0212345678")).toStrictEqual(INVALID); // landline too long
    expect(norm("0112345678")).toStrictEqual(INVALID);
    expect(norm("01234567")).toStrictEqual(INVALID);
    expect(norm("+66712345678")).toStrictEqual(INVALID); // +66 that is not a valid Thai number is not "international"
  });

  it("rejects separators the spec does not strip, letters and empty input", () => {
    expect(norm("081.234.5678")).toStrictEqual(INVALID);
    expect(norm("08l2345678")).toStrictEqual(INVALID);
    expect(norm("")).toStrictEqual(INVALID);
    expect(norm("+")).toStrictEqual(INVALID);
  });

  it("international: + and 8–15 digits", () => {
    expect(norm("+1 (415) 555-2671")).toStrictEqual(ok("+14155552671"));
    expect(norm("+4412345678")).toStrictEqual(ok("+4412345678")); // 10 chars = 9 digits
    expect(norm("+1234567")).toStrictEqual(INVALID); // 7 digits
    expect(norm("+1234567890123456")).toStrictEqual(INVALID); // 16 digits
  });

  it("is idempotent on its own output", () => {
    for (const s of ["+66812345678", "+6621234567", "+6638123456", "+14155552671"]) expect(norm(s)).toStrictEqual(ok(s));
  });
});

describe("formatPhone", () => {
  it("formats each Thai number type", () => {
    expect(formatPhone({ e164: "+66912345678" })).toBe("091-234-5678");
    expect(formatPhone({ e164: "+6653123456" })).toBe("053-123-456");
  });

  it("round-trips through normalizePhone", () => {
    for (const s of ["081-234-5678", "02-123-4567", "038-123-456"]) {
      const { e164 } = norm(s);
      expect(formatPhone({ e164: e164! })).toBe(s);
    }
  });

  it("leaves a non-normalized value unchanged", () => {
    expect(formatPhone({ e164: "+66123" })).toBe("+66123");
  });
});
