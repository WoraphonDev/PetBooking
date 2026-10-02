import { describe, expect, it } from "vitest";
import { promptPayPayload } from "../../../src/payment/promptpay.ts";

const payload = (r: ReturnType<typeof promptPayPayload>) => ("payload" in r ? r.payload : r.error);

describe("promptPayPayload (extra cases beyond the vectors)", () => {
  it("encodes a tax id like a national id (sub-tag 02, 13 digits)", () => {
    expect(payload(promptPayPayload({ type: "tax_id", id: "0-1055-12345-67-8" }))).toMatch(
      /^00020101021129370016A0000006770101110213010551234567853037645802TH6304[0-9A-F]{4}$/,
    );
  });

  it("treats a missing or zero amount as a static QR without tag 54", () => {
    for (const amountSatang of [undefined, null, 0]) {
      const p = payload(promptPayPayload({ type: "phone", id: "0812345678", amountSatang }));
      expect(p.startsWith("000201010211")).toBe(true);
      expect(p).not.toContain("5303764" + "54");
    }
  });

  it("formats sub-baht amounts with a leading zero", () => {
    expect(payload(promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 5 }))).toContain("54040.05");
  });

  it.each([
    ["phone", "08123456789"],
    ["phone", "1812345678"],
    ["national_id", "123456789012"],
    ["ewallet", "12345678901234"],
  ] as const)("rejects %s %s", (type, id) => {
    expect(promptPayPayload({ type, id })).toEqual({ error: "INVALID_PROMPTPAY_ID" });
  });

  it("rejects negative or fractional amounts as a programming error", () => {
    expect(() => promptPayPayload({ type: "phone", id: "0812345678", amountSatang: -1 })).toThrow(RangeError);
    expect(() => promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 1.5 })).toThrow(RangeError);
  });

  it("ends with tag 63 holding exactly 4 upper-case hex CRC digits", () => {
    const p = payload(promptPayPayload({ type: "ewallet", id: "004999012345678" }));
    expect(p).toMatch(/6304[0-9A-F]{4}$/);
    expect(p.length).toBe(p.indexOf("6304") + 8);
  });
});
